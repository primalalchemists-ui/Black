import fs from "fs"
import path from "path"

const ADDRESS = "Sieradzka 28A, 98-300 Wieluń"
const PHONE = "601 275 261"

function getLogoSrc(): string {
  // Zewnętrzny URL (prod/ngrok) — jedyne co działa w Gmailu
  if (process.env.MAIL_LOGO_URL) return process.env.MAIL_LOGO_URL
  // Fallback: base64 (dla klientów które to obsługują, np. Apple Mail)
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "images", "logo", "logo-2-icon.png"))
    return `data:image/png;base64,${buf.toString("base64")}`
  } catch {
    return `${process.env.PAYLOAD_URL ?? ""}/images/logo/logo-2-icon.png`
  }
}

function renderPriceLine(pricePLN: number | null | undefined) {
  if (pricePLN == null || Number(pricePLN) === 0) {
    return "Wejście darmowe";
  }
  return `Kwota: ${Number(pricePLN)} zł (płatność na miejscu)`;
}

export function reservationClientText(p: {
  firstName: string;
  lastName: string;
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  pricePLN: number | null | undefined;
}) {
  return `Cześć ${p.firstName}!

Twoja rezerwacja miejsca została przyjęta ✅

Wydarzenie: ${p.eventTitle}
Data: ${p.dateLabel}
Godzina: ${p.timeLabel}
Adres: ${ADDRESS}
${renderPriceLine(p.pricePLN)}

Jeśli nie możesz się pojawić, daj nam znać mailowo — pomoże to nie blokować miejsc innym osobom.

Do zobaczenia!`;
}

export function reservationOwnerText(p: {
  eventTitle: string;
  dateLabel: string;
  timeLabel: string;
  pricePLN: number | null | undefined;

  firstName: string;
  lastName: string;
  phone: string;
  email: string;

  disabledPerson: boolean;
  disabilityDetails?: string;

  wantInvoice: boolean;
  nip?: string;

  notes?: string;
}) {
  return `NOWA REZERWACJA (biznes)

Wydarzenie: ${p.eventTitle}
Data: ${p.dateLabel}
Godzina: ${p.timeLabel}
Adres: ${ADDRESS}
${renderPriceLine(p.pricePLN)}

Klient:
- Imię i nazwisko: ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- Email: ${p.email}

Dostępność:
- Osoba niepełnosprawna: ${p.disabledPerson ? "TAK" : "NIE"}
- Szczegóły: ${p.disabilityDetails?.trim() || "—"}

Faktura:
- Chce fakturę: ${p.wantInvoice ? "TAK" : "NIE"}
- NIP: ${p.nip?.trim() || "—"}

Notatki:
${p.notes?.trim() || "—"}
`;
}

export function inquiryClientText(p: { firstName: string }) {
  return `Cześć ${p.firstName}!

Otrzymaliśmy Twoje zapytanie ✅
Skontaktujemy się z Tobą najszybciej jak to możliwe.

Pozdrawiamy!`;
}

// ── plain text (backward compat) ──────────────────────────────────────────────

export function bowlingClientText(p: {
  type: "kregle" | "bilard"
  reservationNumber: string
  date: string
  segments: { resourceLabel: string; startHH: string; endHH: string }[]
  totalPLN: number
  firstName: string
}) {
  const typeLabel = p.type === "kregle" ? "kręgli" : "bilarda"
  const segLines = p.segments.map((s) => `${s.resourceLabel}: ${s.startHH}–${s.endHH}`).join("\n")

  return `Cześć ${p.firstName}!

Twoja rezerwacja ${typeLabel} została opłacona i potwierdzona ✅

Numer rezerwacji: ${p.reservationNumber}
Data: ${p.date}

${segLines}

Kwota: ${p.totalPLN.toFixed(2)} zł (zapłacono przez Przelewy24)
Adres: ${ADDRESS}

W razie pytań: ${PHONE}

Do zobaczenia!`
}

export function bowlingOwnerText(p: {
  type: "kregle" | "bilard"
  reservationNumbers: string[]
  date: string
  segments: { resourceLabel: string; startHH: string; endHH: string }[]
  totalPLN: number
  firstName: string
  lastName: string
  phone: string
  email: string
}) {
  const typeLabel = p.type === "kregle" ? "KRĘGLE" : "BILARD"
  const segLines = p.segments.map((s) => `${s.resourceLabel}: ${s.startHH}–${s.endHH}`).join("\n")

  return `NOWA REZERWACJA — ${typeLabel} (opłacona)

Numery rezerwacji: ${p.reservationNumbers.join(", ")}
Data: ${p.date}

${segLines}

Kwota: ${p.totalPLN.toFixed(2)} zł (Przelewy24)

Klient:
- ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- E-mail: ${p.email}`
}

export function stolikClientText(p: {
  reservationNumber: string
  date: string
  time: string
  partySize: number
  firstName: string
}) {
  return `Cześć ${p.firstName}!

Twoja rezerwacja stolika została przyjęta ✅

Numer rezerwacji: ${p.reservationNumber}
Data: ${p.date}
Godzina: ${p.time}
Liczba osób: ${p.partySize}
Adres: ${ADDRESS}

W razie pytań: ${PHONE}

Do zobaczenia!`
}

export function stolikOwnerText(p: {
  reservationNumber: string
  date: string
  time: string
  partySize: number
  firstName: string
  lastName: string
  phone: string
  email: string
}) {
  return `NOWA REZERWACJA — STOLIK

Numer: ${p.reservationNumber}
Data: ${p.date}
Godzina: ${p.time}
Liczba osób: ${p.partySize}

Klient:
- ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- E-mail: ${p.email}`
}

export function inquiryOwnerText(p: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  isCompany: boolean;
  nip?: string;
  message: string;
}) {
  return `NOWE ZAPYTANIE O ORGANIZACJĘ EVENTU

Klient:
- Imię i nazwisko: ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- Email: ${p.email}

Firma:
- Czy firma: ${p.isCompany ? "TAK" : "NIE"}
- NIP: ${p.nip?.trim() || "—"}

Wiadomość:
${p.message?.trim() || "—"}
`;
}

// ── HTML email templates ───────────────────────────────────────────────────────

const COLOR = {
  bg: "#F5F1E8",
  card: "#FAF7F0",
  text: "#181716",
  muted: "#6F6A61",
  gold: "#CDA96A",
  border: "#E3D8C8",
  dark: "#050505",
}

function emailWrapper(content: string) {
  const logoUrl = getLogoSrc()
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Centrum Spotkań BLACK</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Manrope',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${COLOR.bg};padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px;width:100%;">

  <!-- Logo / Brand -->
  <tr><td style="padding-bottom:24px;text-align:center;">
    <img src="${logoUrl}" alt="Centrum Spotkań BLACK" width="100" style="max-width:100px;height:auto;display:block;margin:0 auto;" />
  </td></tr>

  <!-- Card -->
  <tr><td style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:16px;padding:32px 28px;">
    ${content}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding-top:20px;text-align:center;font-size:12px;color:${COLOR.muted};">
    ${ADDRESS} &nbsp;·&nbsp; ${PHONE}<br/>
    <span style="font-size:11px;opacity:0.7;">Centrum Spotkań BLACK</span>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${COLOR.muted};width:140px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:${COLOR.text};font-weight:600;vertical-align:top;">${value}</td>
  </tr>`
}

function statusBadge(status: "paid" | "pending") {
  const isPaid = status === "paid"
  const bg = isPaid ? "#D1FAE5" : "#FEF3C7"
  const color = isPaid ? "#065F46" : "#92400E"
  const label = isPaid ? "Opłacono" : "Oczekuje na potwierdzenie"
  return `<span style="display:inline-block;background:${bg};color:${color};border-radius:20px;padding:3px 12px;font-size:12px;font-weight:600;">${label}</span>`
}

export function bowlingClientHtml(p: {
  type: "kregle" | "bilard"
  reservationNumber: string
  date: string
  segments: { resourceLabel: string; startHH: string; endHH: string }[]
  totalPLN: number
  firstName: string
  paymentStatus?: "paid" | "pending"
}) {
  const typeLabel = p.type === "kregle" ? "Kręgle" : "Bilard"
  const segRows = p.segments
    .map(
      (s) =>
        `<tr style="border-bottom:1px solid ${COLOR.border};">
          <td style="padding:5px 0;font-size:13px;color:${COLOR.text};font-weight:500;">${s.resourceLabel}</td>
          <td style="padding:5px 0;font-size:13px;color:${COLOR.muted};text-align:right;">${s.startHH}–${s.endHH}</td>
        </tr>`
    )
    .join("")

  const status = p.paymentStatus ?? "paid"

  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${COLOR.dark};">Potwierdzenie rezerwacji</h1>
    <p style="margin:0 0 24px;font-size:14px;color:${COLOR.muted};">Cześć ${p.firstName},<br/>Twoja rezerwacja ${typeLabel === "Kręgle" ? "kręgli" : "bilarda"} została potwierdzona.</p>

    ${statusBadge(status)}

    <table style="width:100%;margin-top:20px;border-collapse:collapse;">
      ${row("Numer", `<span style="font-family:monospace;">${p.reservationNumber}</span>`)}
      ${row("Usługa", typeLabel)}
      ${row("Data", p.date)}
      ${row("Kwota", `${p.totalPLN.toFixed(2)} zł`)}
    </table>

    <div style="margin-top:20px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:8px;">Zarezerwowane</div>
      <table style="width:100%;border-collapse:collapse;">
        ${segRows}
      </table>
    </div>

    <div style="margin-top:24px;padding:16px;background:${COLOR.bg};border-radius:10px;font-size:13px;color:${COLOR.muted};">
      📍 ${ADDRESS}<br/>
      📞 ${PHONE}
    </div>

    <p style="margin-top:20px;font-size:13px;color:${COLOR.muted};">
      Płatność zrealizowana przez Przelewy24. W razie pytań lub konieczności zmiany rezerwacji skontaktuj się z nami telefonicznie.
    </p>
  `
  return emailWrapper(content)
}

export function bowlingOwnerHtml(p: {
  type: "kregle" | "bilard"
  reservationNumbers: string[]
  date: string
  segments: { resourceLabel: string; startHH: string; endHH: string }[]
  totalPLN: number
  firstName: string
  lastName: string
  phone: string
  email: string
}) {
  const typeLabel = p.type === "kregle" ? "Kręgle" : "Bilard"
  const segRows = p.segments
    .map(
      (s) =>
        `<tr style="border-bottom:1px solid ${COLOR.border};">
          <td style="padding:5px 0;font-size:13px;color:${COLOR.text};font-weight:500;">${s.resourceLabel}</td>
          <td style="padding:5px 0;font-size:13px;color:${COLOR.muted};text-align:right;">${s.startHH}–${s.endHH}</td>
        </tr>`
    )
    .join("")

  const content = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:${COLOR.dark};">Nowa rezerwacja — ${typeLabel}</h1>
    <p style="margin:0 0 20px;font-size:13px;color:${COLOR.gold};font-weight:600;">Płatność potwierdzona przez Przelewy24</p>

    <table style="width:100%;margin-top:4px;border-collapse:collapse;">
      ${row("Numery", `<span style="font-family:monospace;font-size:12px;">${p.reservationNumbers.join(", ")}</span>`)}
      ${row("Data", p.date)}
      ${row("Kwota", `${p.totalPLN.toFixed(2)} zł`)}
    </table>

    <div style="margin-top:20px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:8px;">Zarezerwowane</div>
      <table style="width:100%;border-collapse:collapse;">
        ${segRows}
      </table>
    </div>

    <div style="margin-top:20px;padding:16px;border:1px solid ${COLOR.border};border-radius:10px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:10px;">Dane klienta</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Imię i nazwisko", `${p.firstName} ${p.lastName}`)}
        ${row("Telefon", p.phone)}
        ${row("E-mail", p.email)}
      </table>
    </div>
  `
  return emailWrapper(content)
}

export function stolikClientHtml(p: {
  reservationNumber: string
  date: string
  time: string
  partySize: number
  firstName: string
}) {
  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${COLOR.dark};">Potwierdzenie rezerwacji stolika</h1>
    <p style="margin:0 0 24px;font-size:14px;color:${COLOR.muted};">Cześć ${p.firstName}, Twoja rezerwacja stolika została przyjęta.</p>

    <table style="width:100%;border-collapse:collapse;">
      ${row("Numer", `<span style="font-family:monospace;">${p.reservationNumber}</span>`)}
      ${row("Data", p.date)}
      ${row("Godzina", p.time)}
      ${row("Liczba osób", String(p.partySize))}
    </table>

    <div style="margin-top:24px;padding:16px;background:${COLOR.bg};border-radius:10px;font-size:13px;color:${COLOR.muted};">
      📍 ${ADDRESS}<br/>
      📞 ${PHONE}
    </div>

    <p style="margin-top:20px;font-size:13px;color:${COLOR.muted};">
      W razie pytań lub konieczności zmiany rezerwacji skontaktuj się z nami telefonicznie.
    </p>
  `
  return emailWrapper(content)
}

// ── Event (impreza / biznes) templates ────────────────────────────────────────

type EventMailParams = {
  type: "impreza" | "biznes"
  reservationNumber: string
  eventTitle: string
  dateLabel: string
  timeLabel: string
  partySize: number
  totalPLN: number
  firstName: string
  paymentStatus: "paid" | "pending" | "not_required"
}

type EventOwnerParams = EventMailParams & {
  lastName: string
  phone: string
  email: string
  wantInvoice: boolean
  invoiceType: string
  nip: string
  notes: string
}

function paymentStatusBadge(status: "paid" | "pending" | "not_required") {
  if (status === "paid") return statusBadge("paid")
  if (status === "pending") return statusBadge("pending")
  return ""
}

export function eventClientText(p: EventMailParams) {
  const typeLabel = p.type === "impreza" ? "imprezy" : "wydarzenia biznesowego"
  const paid = p.paymentStatus === "paid" ? " i opłacona" : p.paymentStatus === "pending" ? " (oczekuje na płatność)" : ""
  const priceRow = p.totalPLN > 0 ? `\nKwota: ${p.totalPLN.toFixed(2)} zł` : ""
  return `Cześć ${p.firstName}!

Twoja rezerwacja ${typeLabel} została przyjęta${paid} ✅

Numer: ${p.reservationNumber}
Wydarzenie: ${p.eventTitle}
Data: ${p.dateLabel}
Godzina: ${p.timeLabel}
Liczba osób: ${p.partySize}${priceRow}
Adres: ${ADDRESS}

W razie pytań: ${PHONE}

Do zobaczenia!`
}

export function eventOwnerText(p: EventOwnerParams) {
  const typeLabel = p.type === "impreza" ? "IMPREZA" : "BIZNES"
  const priceRow = p.totalPLN > 0 ? `\nKwota: ${p.totalPLN.toFixed(2)} zł` : "\nWejście darmowe"
  const paid = p.paymentStatus === "paid" ? " (OPŁACONA)" : p.paymentStatus === "pending" ? " (oczekuje na płatność)" : ""
  return `NOWY ZAPIS — ${typeLabel}${paid}

Numer: ${p.reservationNumber}
Wydarzenie: ${p.eventTitle}
Data: ${p.dateLabel}
Godzina: ${p.timeLabel}
Liczba osób: ${p.partySize}${priceRow}

Klient:
- ${p.firstName} ${p.lastName}
- Telefon: ${p.phone}
- Email: ${p.email}

Faktura: ${p.wantInvoice ? "TAK" : "NIE"}${p.invoiceType === "company" ? ` | Firma | NIP: ${p.nip}` : ""}
Notatki: ${p.notes || "—"}
`
}

export function eventClientHtml(p: EventMailParams) {
  const typeLabel = p.type === "impreza" ? "Impreza" : "Wydarzenie biznesowe"
  const priceRow = p.totalPLN > 0 ? row("Kwota", `${p.totalPLN.toFixed(2)} zł`) : ""
  const badge = paymentStatusBadge(p.paymentStatus)

  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${COLOR.dark};">Potwierdzenie zapisu</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${COLOR.muted};">Cześć ${p.firstName},<br/>Twój zapis na ${typeLabel === "Impreza" ? "imprezę" : "wydarzenie"} został przyjęty.</p>
    ${badge ? `${badge}<br/><br/>` : ""}

    <table style="width:100%;border-collapse:collapse;">
      ${row("Numer", `<span style="font-family:monospace;">${p.reservationNumber}</span>`)}
      ${row("Wydarzenie", p.eventTitle)}
      ${row("Data", p.dateLabel)}
      ${row("Godzina", p.timeLabel)}
      ${row("Liczba osób", String(p.partySize))}
      ${priceRow}
    </table>

    <div style="margin-top:24px;padding:16px;background:${COLOR.bg};border-radius:10px;font-size:13px;color:${COLOR.muted};">
      📍 ${ADDRESS}<br/>
      📞 ${PHONE}
    </div>

    <p style="margin-top:20px;font-size:13px;color:${COLOR.muted};">
      W razie pytań lub konieczności zmiany rezerwacji skontaktuj się z nami telefonicznie.
    </p>
  `
  return emailWrapper(content)
}

export function eventOwnerHtml(p: EventOwnerParams) {
  const typeLabel = p.type === "impreza" ? "Impreza" : "Biznes"
  const priceRow = p.totalPLN > 0 ? row("Kwota", `${p.totalPLN.toFixed(2)} zł`) : row("Cena", "Darmowe")
  const badge = paymentStatusBadge(p.paymentStatus)
  const invoiceRow = p.wantInvoice
    ? row("Faktura", p.invoiceType === "company" ? `Firma · NIP: ${p.nip}` : "Osoba prywatna")
    : ""

  const content = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:${COLOR.dark};">Nowy zapis — ${typeLabel}</h1>
    ${badge ? `<p style="margin:0 0 16px;">${badge}</p>` : ""}

    <table style="width:100%;border-collapse:collapse;">
      ${row("Numer", `<span style="font-family:monospace;font-size:12px;">${p.reservationNumber}</span>`)}
      ${row("Wydarzenie", p.eventTitle)}
      ${row("Data", p.dateLabel)}
      ${row("Godzina", p.timeLabel)}
      ${row("Liczba osób", String(p.partySize))}
      ${priceRow}
    </table>

    <div style="margin-top:20px;padding:16px;border:1px solid ${COLOR.border};border-radius:10px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:10px;">Dane klienta</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Imię i nazwisko", `${p.firstName} ${p.lastName}`)}
        ${row("Telefon", p.phone)}
        ${row("E-mail", p.email)}
        ${invoiceRow}
      </table>
    </div>

    ${p.notes ? `<div style="margin-top:16px;font-size:13px;color:${COLOR.muted};"><strong>Notatki:</strong> ${p.notes}</div>` : ""}
  `
  return emailWrapper(content)
}

export function inquiryOwnerHtml(p: {
  firstName: string
  lastName: string
  phone: string
  email: string
  isCompany: boolean
  nip?: string
  message: string
}) {
  const content = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:${COLOR.dark};">Nowe zapytanie o wydarzenie</h1>
    <p style="margin:0 0 20px;font-size:13px;color:${COLOR.gold};font-weight:600;">Zapytanie o organizację eventu</p>

    <div style="margin-top:4px;padding:16px;border:1px solid ${COLOR.border};border-radius:10px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:10px;">Dane klienta</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Imię i nazwisko", `${p.firstName} ${p.lastName}`)}
        ${row("Telefon", p.phone)}
        ${row("E-mail", p.email)}
        ${row("Firma", p.isCompany ? (p.nip ? `Tak · NIP: ${p.nip}` : "Tak") : "Nie")}
      </table>
    </div>

    ${p.message ? `<div style="margin-top:16px;padding:16px;background:${COLOR.bg};border-radius:10px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:8px;">Wiadomość</div>
      <p style="margin:0;font-size:13px;color:${COLOR.text};white-space:pre-wrap;">${p.message.trim()}</p>
    </div>` : ""}
  `
  return emailWrapper(content)
}

export function inquiryClientHtml(p: { firstName: string }) {
  const content = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:${COLOR.dark};">Otrzymaliśmy Twoje zapytanie</h1>
    <p style="margin:0 0 24px;font-size:14px;color:${COLOR.muted};">Cześć ${p.firstName},<br/>Skontaktujemy się z Tobą najszybciej jak to możliwe.</p>

    <div style="margin-top:24px;padding:16px;background:${COLOR.bg};border-radius:10px;font-size:13px;color:${COLOR.muted};">
      📍 ${ADDRESS}<br/>
      📞 ${PHONE}
    </div>

    <p style="margin-top:20px;font-size:13px;color:${COLOR.muted};">
      W razie pilnych pytań możesz skontaktować się z nami telefonicznie.
    </p>
  `
  return emailWrapper(content)
}

export function stolikOwnerHtml(p: {
  reservationNumber: string
  date: string
  time: string
  partySize: number
  firstName: string
  lastName: string
  phone: string
  email: string
}) {
  const content = `
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:${COLOR.dark};">Nowa rezerwacja stolika</h1>

    <table style="width:100%;margin-top:16px;border-collapse:collapse;">
      ${row("Numer", `<span style="font-family:monospace;font-size:12px;">${p.reservationNumber}</span>`)}
      ${row("Data", p.date)}
      ${row("Godzina", p.time)}
      ${row("Liczba osób", String(p.partySize))}
    </table>

    <div style="margin-top:20px;padding:16px;border:1px solid ${COLOR.border};border-radius:10px;">
      <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.muted};margin-bottom:10px;">Dane klienta</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Imię i nazwisko", `${p.firstName} ${p.lastName}`)}
        ${row("Telefon", p.phone)}
        ${row("E-mail", p.email)}
      </table>
    </div>
  `
  return emailWrapper(content)
}
