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

  // Szukaj rekordu płatności po p24SessionId (może nie istnieć przy starych rezerwacjach)
  const paymentResult = await payload.find({
    collection: "payments",
    limit: 1,
    overrideAccess: true,
    where: { p24SessionId: { equals: sessionId } },
  })
  const paymentDoc: any = (paymentResult.docs as any[])[0] ?? null

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
      if (paymentDoc) {
        await payload
          .update({ collection: "payments", id: paymentDoc.id, data: { status: "failed" } as any, overrideAccess: true })
          .catch((e) => console.error("[confirmGroupPayment] payment update (failed) error:", e))
      }
      return "verify_failed"
    }
  }

  // Sprawdź czy callback przyszedł po wygaśnięciu holda i czy slot jest nadal wolny
  const now = new Date()
  let needsManualReview = false

  for (const doc of docs) {
    if (!doc.expiresAt || new Date(doc.expiresAt) >= now) continue

    const type = doc.type as string
    if (type !== "bilard" && type !== "kregle") continue

    const docResIds: string[] = ((doc.resources ?? []) as any[])
      .map((r: any) => (typeof r === "object" ? String(r.id ?? "") : String(r)))
      .filter(Boolean)

    if (docResIds.length === 0 || !doc.startsAt || !doc.endsAt) continue

    const conflictDocs = await payload.find({
      collection: "reservations",
      limit: 10,
      overrideAccess: true,
      where: {
        and: [
          { type: { equals: type } },
          { groupId: { not_equals: String(doc.groupId) } },
          { status: { in: ["new", "confirmed"] } },
          { startsAt: { less_than: doc.endsAt } },
          { endsAt: { greater_than: doc.startsAt } },
        ],
      },
    })

    const hasConflict = (conflictDocs.docs as any[]).some((conflict) => {
      const conflictResIds: string[] = ((conflict.resources ?? []) as any[])
        .map((r: any) => (typeof r === "object" ? String(r.id ?? "") : String(r)))
        .filter(Boolean)
      return docResIds.some((id) => conflictResIds.includes(id))
    })

    if (hasConflict) {
      needsManualReview = true
      console.error(
        `[confirmGroupPayment] WYMAGA RĘCZNEJ OBSŁUGI: płatność po wygaśnięciu holda z konfliktem. sessionId=${sessionId} docId=${doc.id} type=${type} resIds=${docResIds.join(",")}`,
      )
      break
    }
  }

  if (needsManualReview) {
    const manualNote =
      "Płatność przyszła po wygaśnięciu holda. Slot został zajęty przez inną rezerwację. Wymaga kontaktu z klientem."
    for (const doc of docs) {
      await payload
        .update({
          collection: "reservations",
          id: doc.id,
          data: { paymentStatus: "paid", internalNote: manualNote } as any,
          overrideAccess: true,
        })
        .catch((err) => console.error("[confirmGroupPayment] Update (manual review) failed:", err))
    }
    if (paymentDoc) {
      await payload
        .update({
          collection: "payments",
          id: paymentDoc.id,
          data: { status: "paid", p24OrderId: String(opts?.orderId ?? "") } as any,
          overrideAccess: true,
        })
        .catch((e) => console.error("[confirmGroupPayment] payment update (manual review) error:", e))
    } else {
      const totalPLN = docs.reduce((acc, doc) => acc + Number(doc.depositAmount ?? 0), 0)
      await payload
        .create({
          collection: "payments",
          overrideAccess: true,
          data: {
            provider: "p24",
            status: "paid",
            amount: opts?.amount ? opts.amount / 100 : totalPLN,
            currency: "PLN",
            p24SessionId: sessionId,
            p24OrderId: String(opts?.orderId ?? ""),
            reservation: docs[0].id,
          } as any,
        })
        .catch((e) => console.error("[confirmGroupPayment] payment create (manual review) error:", e))
    }
    console.error(
      `[confirmGroupPayment] Rezerwacja NIE potwierdzona automatycznie — wymagana ręczna weryfikacja. sessionId=${sessionId}`,
    )
    return "ok"
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

  if (paymentDoc) {
    await payload
      .update({
        collection: "payments",
        id: paymentDoc.id,
        data: { status: "paid", p24OrderId: String(opts?.orderId ?? "") } as any,
        overrideAccess: true,
      })
      .catch((e) => console.error("[confirmGroupPayment] payment update error:", e))
  } else {
    const totalPLN = docs.reduce((acc, doc) => acc + Number(doc.depositAmount ?? 0), 0)
    await payload
      .create({
        collection: "payments",
        overrideAccess: true,
        data: {
          provider: "p24",
          status: "paid",
          amount: opts?.amount ? opts.amount / 100 : totalPLN,
          currency: "PLN",
          p24SessionId: sessionId,
          p24OrderId: String(opts?.orderId ?? ""),
          reservation: docs[0].id,
        } as any,
      })
      .catch((e) => console.error("[confirmGroupPayment] payment create error:", e))
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
    const reservationNumbers = (() => {
      const nums = docs.flatMap((doc) => doc.reservationNumber ? [String(doc.reservationNumber)] : [])
      return nums.length ? [...new Set(nums)] : [String(docs[0]?.id ?? "")]
    })()

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

      const segments = docs.flatMap((doc) => {
        // Nowy format: segmenty per zasób (depth:1 populuje obiekt resource)
        const segs = Array.isArray(doc.segments) ? doc.segments as any[] : []
        if (segs.length > 0) {
          return segs.map((seg: any) => {
            const resObj = seg.resource && typeof seg.resource === "object" ? seg.resource : null
            const num = resObj?.number ?? "?"
            const resourceLabel = laneType === "kregle" ? `Tor ${num}` : `Stół ${num}`
            const startHH = `${String(seg.startHour ?? 0).padStart(2, "0")}:${String(seg.startMinute ?? 0).padStart(2, "0")}`
            const endHH = `${String(seg.endHour ?? 0).padStart(2, "0")}:${String(seg.endMinute ?? 0).padStart(2, "0")}`
            return { resourceLabel, startHH, endHH }
          })
        }

        // Fallback: stary format
        const resourceList = (doc.resources as any[]) ?? []
        const startHH = `${String(doc.startHour ?? 0).padStart(2, "0")}:${String(doc.startMinute ?? 0).padStart(2, "0")}`
        const endHH = `${String(doc.endHour ?? 0).padStart(2, "0")}:${String(doc.endMinute ?? 0).padStart(2, "0")}`
        const nums = resourceList
          .map((r: any) => (r && typeof r === "object" ? r.number : null))
          .filter((n: any) => n != null)
        if (!nums.length) {
          const resourceLabel = laneType === "kregle" ? "Tor ?" : "Stół ?"
          return [{ resourceLabel, startHH, endHH }]
        }
        return nums.map((num: any) => {
          const resourceLabel = laneType === "kregle" ? `Tor ${num}` : `Stół ${num}`
          return { resourceLabel, startHH, endHH }
        })
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
