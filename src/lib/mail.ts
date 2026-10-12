// // import nodemailer from "nodemailer";

// // function getEnv(name: string) {
// //   const v = process.env[name];
// //   return v && v.length ? v : null;
// // }

// // function requireAtRuntime(name: string) {
// //   const v = getEnv(name);
// //   if (!v) throw new Error(`MAIL_NOT_CONFIGURED:${name}`);
// //   return v;
// // }

// // export function getMailTransport() {
// //   const host = getEnv("MAIL_HOST");
// //   const portRaw = getEnv("MAIL_PORT");
// //   const secureRaw = getEnv("MAIL_SECURE");
// //   const user = getEnv("MAIL_USER");
// //   const pass = getEnv("MAIL_PASS");

// //   if (!host || !portRaw || !secureRaw || !user || !pass) {
// //     // Nie zabijaj builda — zgłoś, że mail nie jest skonfigurowany
// //     throw new Error("MAIL_NOT_CONFIGURED");
// //   }

// //   const port = Number(portRaw);
// //   const secure = String(secureRaw).toLowerCase() === "true";

// //   return nodemailer.createTransport({
// //     host,
// //     port,
// //     secure,
// //     auth: { user, pass },
// //   });
// // }

// // export function getMailFrom() {
// //   // MAIL_FROM może być wymagane dopiero gdy faktycznie wysyłasz mail
// //   return requireAtRuntime("MAIL_FROM");
// // }

// // export function getOwnerTo() {
// //   return requireAtRuntime("MAIL_TO_OWNER");
// // }
// import nodemailer, { Transporter } from "nodemailer";

// function getEnv(name: string) {
//   const v = process.env[name];
//   return v && v.length ? v : null;
// }

// function requireAtRuntime(name: string) {
//   const v = getEnv(name);
//   if (!v) throw new Error(`MAIL_NOT_CONFIGURED:${name}`);
//   return v;
// }

// let cachedTransport: Transporter | null = null;

// export function getMailTransport(): Transporter {
//   if (cachedTransport) return cachedTransport;

//   const host = getEnv("MAIL_HOST");
//   const portRaw = getEnv("MAIL_PORT");
//   const secureRaw = getEnv("MAIL_SECURE");
//   const user = getEnv("MAIL_USER");
//   const pass = getEnv("MAIL_PASS");

//   if (!host || !portRaw || !secureRaw || !user || !pass) {
//     // Nie zabijaj builda importem — rzucaj dopiero gdy endpoint próbuje wysłać maila.
//     throw new Error("MAIL_NOT_CONFIGURED");
//   }

//   const port = Number(portRaw);
//   const secure = String(secureRaw).toLowerCase() === "true";

//   cachedTransport = nodemailer.createTransport({
//     host,
//     port,
//     secure,
//     auth: { user, pass },
//   });

//   return cachedTransport;
// }

// export function getMailFrom() {
//   return requireAtRuntime("MAIL_FROM");
// }

// export function getOwnerTo() {
//   // Masz w Railway: MAIL_TO_OWNER (na screenie było MAIL_TO_OWNER, a w kodzie było MAIL_TO_OWNER)
//   // Jeśli zmienna na Railway nazywa się MAIL_TO_OWNER, to zostaw tak:
//   return requireAtRuntime("MAIL_TO_OWNER");
// }

// src/lib/mail.ts (lub lib/mail.ts)
import { Resend } from "resend";

import {
  applyRecipientPolicy,
  describeRedirect,
  requireTestRecipient,
  resolveMailMode,
} from "@/lib/mailPolicy";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.length ? v : null;
}

function requireAtRuntime(name: string) {
  const v = getEnv(name);
  if (!v) throw new Error(`MAIL_NOT_CONFIGURED:${name}`);
  return v;
}

type MailSendParams = {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  [k: string]: unknown;
};

function makeMockClient(): Resend {
  const mock = {
    emails: {
      send: async (params: MailSendParams) => {
        const to = Array.isArray(params.to) ? params.to.join(", ") : params.to;
        console.log(
          `\n[EMAIL_MODE=mock] MAIL WOULD BE SENT\n` +
          `  From:    ${params.from}\n` +
          `  To:      ${to}\n` +
          `  Subject: ${params.subject}\n` +
          `  Text:    ${(params.text ?? "").slice(0, 300)}\n`
        );
        return { data: { id: `mock-${Date.now()}` }, error: null };
      },
    },
  };
  return mock as unknown as Resend;
}

let cachedResend: Resend | null = null;

/**
 * Nakłada politykę adresatów na KAŻDĄ wysyłkę.
 *
 * Opakowanie jest tu, a nie u wywołujących, bo konwencja `effectiveTo()`
 * raz już zawiodła — `/api/inquiries/occasional` wysyłał na adres
 * z formularza. Patrz `src/lib/mailPolicy.ts`.
 *
 * W trybie `live` polityka jest przelotką, więc produkcja działa jak dotąd.
 *
 * Eksportowane, żeby testy mogły sprawdzić samo opakowanie na atrapie klienta,
 * bez kontaktu z Resendem.
 */
export function withRecipientPolicy(client: Resend): Resend {
  const originalSend = client.emails.send.bind(client.emails);

  const guarded = async (params: MailSendParams, options?: unknown) => {
    const note = describeRedirect(params as Record<string, unknown>);
    if (note) console.log(`[mail] ${note}`);

    // Rzuca, gdy adresat jest niedozwolony — wywołujący mają wysyłkę
    // w best-effort try/catch, więc rezerwacja i tak się zapisze.
    const safe = applyRecipientPolicy(params as Record<string, unknown>);

    return originalSend(safe as never, options as never);
  };

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "emails") return Reflect.get(target, prop, receiver);
      const emails = Reflect.get(target, prop, receiver) as Resend["emails"];
      return new Proxy(emails, {
        get(emailsTarget, emailsProp, emailsReceiver) {
          if (emailsProp === "send") return guarded;
          return Reflect.get(emailsTarget, emailsProp, emailsReceiver);
        },
      });
    },
  });
}

export function getMailClient(): Resend {
  const mode = resolveMailMode();

  // Tryb testowy musi mieć adres docelowy, zanim cokolwiek powstanie.
  if (mode === "test") requireTestRecipient();

  if (mode === "mock") return withRecipientPolicy(makeMockClient());

  if (cachedResend) return cachedResend;

  const key = getEnv("RESEND_API_KEY");
  if (!key) {
    // best-effort: endpoint może zwrócić 503 zamiast wywalać build
    throw new Error("MAIL_NOT_CONFIGURED");
  }

  cachedResend = withRecipientPolicy(new Resend(key));
  return cachedResend;
}

export function getMailFrom() {
  // Preferuj EMAIL_FROM="BLACK <email@...>" jeśli ustawione
  const emailFrom = getEnv("EMAIL_FROM");
  if (emailFrom) return emailFrom;

  // Fallback: MAIL_FROM_NAME + MAIL_FROM_EMAIL
  const name = getEnv("MAIL_FROM_NAME") ?? "BLACK";
  const email = getEnv("MAIL_FROM_EMAIL") ?? "onboarding@resend.dev";
  return `${name} <${email}>`;
}

export function getOwnerTo() {
  return requireAtRuntime("MAIL_TO_OWNER");
}

/**
 * Adres, na który wiadomość rzeczywiście pojedzie.
 *
 * Zostaje dla zgodności z istniejącymi wywołaniami i logami, ale nie jest już
 * jedynym zabezpieczeniem — transport nakłada politykę niezależnie.
 *
 * Poprzednia wersja miała odwrót `?? actual`: przy EMAIL_MODE=test bez
 * RESERVATION_TEST_EMAIL wiadomość szła do KLIENTA. Teraz taki stan rzuca.
 */
export function effectiveTo(actual: string): string {
  if (resolveMailMode() !== "test") return actual;
  return requireTestRecipient();
}

/**
 * Adres właściciela. W trybie testowym również podlega przekierowaniu, żeby
 * logi zgadzały się z tym, co faktycznie robi transport.
 */
export function effectiveOwnerTo(): string {
  return effectiveTo(getOwnerTo());
}
