import nodemailer from "nodemailer";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.length ? v : null;
}

function requireAtRuntime(name: string) {
  const v = getEnv(name);
  if (!v) throw new Error(`MAIL_NOT_CONFIGURED:${name}`);
  return v;
}

export function getMailTransport() {
  const host = getEnv("MAIL_HOST");
  const portRaw = getEnv("MAIL_PORT");
  const secureRaw = getEnv("MAIL_SECURE");
  const user = getEnv("MAIL_USER");
  const pass = getEnv("MAIL_PASS");

  if (!host || !portRaw || !secureRaw || !user || !pass) {
    // Nie zabijaj builda — zgłoś, że mail nie jest skonfigurowany
    throw new Error("MAIL_NOT_CONFIGURED");
  }

  const port = Number(portRaw);
  const secure = String(secureRaw).toLowerCase() === "true";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function getMailFrom() {
  // MAIL_FROM może być wymagane dopiero gdy faktycznie wysyłasz mail
  return requireAtRuntime("MAIL_FROM");
}

export function getOwnerTo() {
  return requireAtRuntime("MAIL_TO_OWNER");
}
