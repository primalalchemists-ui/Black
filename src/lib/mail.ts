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

export function getMailClient(): Resend {
  if (process.env.EMAIL_MODE === "mock") return makeMockClient();

  if (cachedResend) return cachedResend;

  const key = getEnv("RESEND_API_KEY");
  if (!key) {
    // best-effort: endpoint może zwrócić 503 zamiast wywalać build
    throw new Error("MAIL_NOT_CONFIGURED");
  }

  cachedResend = new Resend(key);
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

export function effectiveTo(actual: string): string {
  return process.env.EMAIL_MODE === "test"
    ? (process.env.RESERVATION_TEST_EMAIL ?? actual)
    : actual;
}
