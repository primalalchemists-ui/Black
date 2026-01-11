import nodemailer from "nodemailer";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const host = required("MAIL_HOST");
const port = Number(required("MAIL_PORT"));
const secure = String(required("MAIL_SECURE")) === "true";
const user = required("MAIL_USER");
const pass = required("MAIL_PASS");

export const mailTransport = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
});

export function getMailFrom() {
  return required("MAIL_FROM");
}

export function getOwnerTo() {
  return required("MAIL_TO_OWNER");
}
