import { getPayload } from "payload"
import config from "@payload-config"
import { verifyTransaction } from "@/lib/p24"
import { getMailClient, getMailFrom, getOwnerTo, effectiveTo } from "@/lib/mail"
import {
  bowlingClientHtml, bowlingClientText,
  bowlingOwnerHtml, bowlingOwnerText,
  eventClientHtml, eventClientText,
  eventOwnerHtml, eventOwnerText,
} from "@/lib/mailTemplates"
import { getEventDisplayDateTimePL } from "@/lib/cms/events"

export type ConfirmResult = "ok" | "already_paid" | "not_found" | "verify_failed"

export async function confirmGroupPayment(
  sessionId: string,
  opts?: { skipP24Verify?: boolean; orderId?: number; amount?: number },
): Promise<ConfirmResult> {
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: "reservations",
    limit: 100,
    depth: 1,
    where: { groupId: { equals: sessionId } },
    overrideAccess: true,
  })

  const docs = result.docs as any[]

  if (!docs.length) {
    console.error("[confirmGroupPayment] Brak rezerwacji dla sessionId:", sessionId)
    return "not_found"
  }

  if (docs.some((d) => d.paymentStatus === "paid")) {
    console.log(`[confirmGroupPayment] Już opłacone, idempotent. sessionId=${sessionId}`)
    return "already_paid"
  }

  if (!opts?.skipP24Verify) {
    let verified = false
    try {
      verified = await verifyTransaction({
        sessionId,
        orderId: opts?.orderId ?? 0,
        amount: opts?.amount ?? 0,
      })
    } catch (err) {
      console.error("[confirmGroupPayment] Błąd weryfikacji P24:", err)
      return "verify_failed"
    }

    if (!verified) {
      console.error("[confirmGroupPayment] P24 verify=false. sessionId:", sessionId)
      for (const doc of docs) {
        await payload
          .update({ collection: "reservations", id: doc.id, data: { paymentStatus: "failed" } as any, overrideAccess: true })
          .catch((err) => console.error("[confirmGroupPayment] Update failed:", err))
      }
      return "verify_failed"
    }
  }

  for (const doc of docs) {
    await payload
      .update({
        collection: "reservations",
        id: doc.id,
        data: { paymentStatus: "paid", status: "confirmed" } as any,
        overrideAccess: true,
      })
      .catch((err) => console.error("[confirmGroupPayment] Update failed:", err))
  }

  console.log(`[confirmGroupPayment] Oznaczono jako opłacone. sessionId=${sessionId} docs=${docs.length}`)

  try {
    const first = docs[0]
    const type = first.type as string
    const clientEmail: string = first.customer?.email ?? ""
    const ownerEmail = getOwnerTo()
    const from = getMailFrom()
    const mail = getMailClient()

    const totalPLN = docs.reduce((acc, doc) => acc + Number(doc.depositAmount ?? 0), 0)
    const reservationNumbers = [...new Set(docs.map((doc) => String(doc.reservationNumber ?? doc.id)))]

    if (type === "impreza" || type === "biznes") {
      const eventObj = typeof first.event === "object" ? first.event : null
      const eventTitle = eventObj?.title ?? "—"
      const dt = eventObj ? getEventDisplayDateTimePL(eventObj) : null
      const dateLabel = dt?.date ?? (() => {
        const iso = String(first.day ?? "").slice(0, 10)
        const [y, m, d] = iso.split("-")
        return iso ? `${d}.${m}.${y}` : "—"
      })()
      const timeLabel = dt?.time ?? (() => {
        const hh = String(first.startHour ?? "").padStart(2, "0")
        const mm = String(first.startMinute ?? "0").padStart(2, "0")
        return hh ? `${hh}:${mm}` : "—"
      })()
      const partySize = Number(first.partySize) || 1
      const reservationNumber = reservationNumbers[0] ?? ""

      const emailParams = {
        type: type as "impreza" | "biznes",
        reservationNumber,
        eventTitle,
        dateLabel,
        timeLabel,
        partySize,
        totalPLN,
        paymentStatus: "paid" as const,
      }

      if (clientEmail) {
        console.log(`[confirmGroupPayment] Wysyłam mail (${type}) do klienta: ${effectiveTo(clientEmail)}`)
        await mail.emails.send({
          from,
          to: effectiveTo(clientEmail),
          subject: `Potwierdzenie rezerwacji: ${eventTitle} — ${reservationNumber}`,
          text: eventClientText({ ...emailParams, firstName: first.customer?.firstName ?? "" }),
          html: eventClientHtml({ ...emailParams, firstName: first.customer?.firstName ?? "" }),
        })
      }

      console.log(`[confirmGroupPayment] Wysyłam mail (${type}) do obsługi: ${effectiveTo(ownerEmail)}`)
      await mail.emails.send({
        from,
        to: effectiveTo(ownerEmail),
        subject: `Zapis (opłacony) — ${type === "impreza" ? "Impreza" : "Biznes"}: ${eventTitle}`,
        text: eventOwnerText({
          ...emailParams,
          firstName: first.customer?.firstName ?? "",
          lastName: first.customer?.lastName ?? "",
          phone: first.customer?.phone ?? "—",
          email: clientEmail || "—",
          wantInvoice: Boolean(first.invoice?.wantInvoice),
          invoiceType: first.invoice?.invoiceType ?? "",
          nip: first.invoice?.nip ?? "",
          notes: first.notes ?? "",
        }),
        html: eventOwnerHtml({
          ...emailParams,
          firstName: first.customer?.firstName ?? "",
          lastName: first.customer?.lastName ?? "",
          phone: first.customer?.phone ?? "—",
          email: clientEmail || "—",
          wantInvoice: Boolean(first.invoice?.wantInvoice),
          invoiceType: first.invoice?.invoiceType ?? "",
          nip: first.invoice?.nip ?? "",
          notes: first.notes ?? "",
        }),
        reply_to: clientEmail || undefined,
      })
    } else {
      const laneType = type as "kregle" | "bilard"
      const dateISO = String(first.day ?? "").slice(0, 10)
      const [y, m, d] = dateISO.split("-")
      const dateDisplay = `${d}.${m}.${y}`

      const segments = docs.map((doc) => {
        const resourceList = (doc.resources as any[]) ?? []
        const resourceNumber = resourceList[0]?.number ?? "?"
        const resourceLabel = laneType === "kregle" ? `Tor ${resourceNumber}` : `Stół ${resourceNumber}`
        const startHH = `${String(doc.startHour ?? 0).padStart(2, "0")}:${String(doc.startMinute ?? 0).padStart(2, "0")}`
        const endHH = `${String(doc.endHour ?? 0).padStart(2, "0")}:${String(doc.endMinute ?? 0).padStart(2, "0")}`
        return { resourceLabel, startHH, endHH }
      })

      if (clientEmail) {
        console.log(`[confirmGroupPayment] Wysyłam mail do klienta: ${effectiveTo(clientEmail)}`)
        await mail.emails.send({
          from,
          to: effectiveTo(clientEmail),
          subject: `Potwierdzenie rezerwacji — ${reservationNumbers[0]}`,
          text: bowlingClientText({ type: laneType, reservationNumber: reservationNumbers[0], date: dateDisplay, segments, totalPLN, firstName: first.customer?.firstName ?? "" }),
          html: bowlingClientHtml({ type: laneType, reservationNumber: reservationNumbers[0], date: dateDisplay, segments, totalPLN, firstName: first.customer?.firstName ?? "", paymentStatus: "paid" }),
        })
      }

      console.log(`[confirmGroupPayment] Wysyłam mail do obsługi: ${effectiveTo(ownerEmail)}`)
      await mail.emails.send({
        from,
        to: effectiveTo(ownerEmail),
        subject: `Nowa rezerwacja (opłacona) — ${reservationNumbers.join(", ")}`,
        text: bowlingOwnerText({ type: laneType, reservationNumbers, date: dateDisplay, segments, totalPLN, firstName: first.customer?.firstName ?? "", lastName: first.customer?.lastName ?? "", phone: first.customer?.phone ?? "—", email: clientEmail || "—" }),
        html: bowlingOwnerHtml({ type: laneType, reservationNumbers, date: dateDisplay, segments, totalPLN, firstName: first.customer?.firstName ?? "", lastName: first.customer?.lastName ?? "", phone: first.customer?.phone ?? "—", email: clientEmail || "—" }),
      })
    }

    console.log(`[confirmGroupPayment] Maile wysłane. sessionId=${sessionId}`)
  } catch (err) {
    console.error("[confirmGroupPayment] Błąd wysyłki maila:", err)
  }

  return "ok"
}
