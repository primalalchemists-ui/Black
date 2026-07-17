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
import { withPaymentLock } from "@/lib/paymentLifecycle"

export type ConfirmResult = "ok" | "already_paid" | "not_found" | "verify_failed" | "db_error"

export async function confirmGroupPayment(
  sessionId: string,
  opts?: { skipP24Verify?: boolean; orderId?: number; amount?: number },
): Promise<ConfirmResult> {
  const payload = await getPayload({ config })

  // Docs and payment captured inside lock, used for mail outside lock
  let mailDocs: any[] = []
  let shouldSendMail = false

  const result = await withPaymentLock(payload, sessionId, async () => {
    // Fresh read inside lock — prevents stale state
    const freshResult = await payload.find({
      collection: "reservations",
      limit: 100,
      depth: 1,
      where: { groupId: { equals: sessionId } },
      overrideAccess: true,
    })
    const docs = freshResult.docs as any[]

    if (!docs.length) {
      console.error(`[confirmGroupPayment] NOT_FOUND sessionId=${sessionId}`)
      return "not_found"
    }

    // Idempotency: if EVERY doc is paid → truly done
    // Note: "verifying" docs = previous attempt interrupted at DB stage → re-process
    if (docs.every((d) => d.paymentStatus === "paid")) {
      console.log(`[confirmGroupPayment] ALREADY_PAID idempotent. sessionId=${sessionId}`)
      return "already_paid"
    }

    // Find payment doc (may exist if created before redirect)
    const paymentResult = await payload.find({
      collection: "payments",
      limit: 1,
      overrideAccess: true,
      where: { p24SessionId: { equals: sessionId } },
    })
    const paymentDoc: any = (paymentResult.docs as any[])[0] ?? null

    if (!opts?.skipP24Verify) {
      // Set verifying BEFORE P24 HTTP call — blocks cancel from deleting
      for (const doc of docs) {
        if (doc.paymentStatus === "pending") {
          await payload
            .update({
              collection: "reservations",
              id: doc.id,
              data: { paymentStatus: "verifying" } as any,
              overrideAccess: true,
            })
            .catch((err) =>
              console.error(`[confirmGroupPayment] WARN: nie udało się ustawić verifying id=${doc.id}:`, err?.message),
            )
        }
        // paymentStatus === "verifying": already set from previous interrupted attempt — no-op
      }

      let verified = false
      try {
        console.log(
          `[confirmGroupPayment] P24_VERIFY_STARTED` +
            ` sessionId=${sessionId}` +
            ` orderId=${opts?.orderId ?? "-"}` +
            ` amount=${opts?.amount ?? "-"}`,
        )
        verified = await verifyTransaction({
          sessionId,
          orderId: opts?.orderId ?? 0,
          amount: opts?.amount ?? 0,
        })
      } catch (err) {
        console.error(`[confirmGroupPayment] P24_VERIFY_ERROR sessionId=${sessionId}`, err)
        for (const doc of docs) {
          await payload
            .update({ collection: "reservations", id: doc.id, data: { paymentStatus: "pending" } as any, overrideAccess: true })
            .catch(() => {})
        }
        return "verify_failed"
      }

      if (!verified) {
        console.error(`[confirmGroupPayment] P24_VERIFY_FALSE sessionId=${sessionId}`)
        for (const doc of docs) {
          await payload
            .update({ collection: "reservations", id: doc.id, data: { paymentStatus: "pending" } as any, overrideAccess: true })
            .catch((err) => console.error("[confirmGroupPayment] Update (revert) failed:", err))
        }
        return "verify_failed"
      }

      console.log(`[confirmGroupPayment] P24_VERIFY_OK sessionId=${sessionId}`)
    }

    // Sprawdź czy callback przyszedł po wygaśnięciu holda
    const now = new Date()
    let needsManualReview = false

    for (const doc of docs) {
      if (!doc.expiresAt || new Date(doc.expiresAt) >= now) continue

      const type = doc.type as string

      if (type === "kregle" || type === "bilard") {
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
          const cIds: string[] = ((conflict.resources ?? []) as any[])
            .map((r: any) => (typeof r === "object" ? String(r.id ?? "") : String(r)))
            .filter(Boolean)
          return docResIds.some((id) => cIds.includes(id))
        })

        if (hasConflict) {
          needsManualReview = true
          console.error(
            `[confirmGroupPayment] PAID_RESOURCE_CONFLICT` +
              ` sessionId=${sessionId} docId=${doc.id} reservationNumber=${doc.reservationNumber}` +
              ` type=${type} resIds=${docResIds.join(",")}`,
          )
          break
        }
      } else if (type === "impreza" || type === "biznes") {
        const eventId = typeof doc.event === "object" ? (doc.event as any)?.id : doc.event
        if (!eventId) continue

        const event = await payload
          .findByID({ collection: "events", id: eventId, overrideAccess: true })
          .catch(() => null)
        const capacity = typeof event?.capacity === "number" && event.capacity > 0 ? event.capacity : null
        if (!capacity) continue

        const nowISO = new Date().toISOString()
        const takenDocs = await payload.find({
          collection: "reservations",
          limit: 5000,
          overrideAccess: true,
          where: {
            and: [
              { type: { equals: type } },
              { event: { equals: String(eventId) } },
              { status: { in: ["new", "confirmed"] } },
              { groupId: { not_equals: sessionId } },
              {
                or: [
                  { paymentStatus: { not_equals: "pending" } },
                  { expiresAt: { exists: false } },
                  { expiresAt: { greater_than_equal: nowISO } },
                ],
              } as any,
            ],
          },
        })
        const takenSeats = (takenDocs.docs as any[]).reduce((sum, r) => sum + (Number(r.partySize) || 1), 0)
        const docSeats = Number(doc.partySize) || 1

        if (takenSeats + docSeats > capacity) {
          needsManualReview = true
          console.error(
            `[confirmGroupPayment] PAID_RESOURCE_CONFLICT` +
              ` type=${type} eventId=${eventId} capacity=${capacity}` +
              ` taken=${takenSeats} requested=${docSeats} sessionId=${sessionId}` +
              ` reservationNumber=${doc.reservationNumber}` +
              ` customer=${doc.customer?.firstName} ${doc.customer?.lastName}` +
              ` amount=${opts?.amount ?? "-"}`,
          )
          break
        }
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
        `[confirmGroupPayment] PAID_RESOURCE_CONFLICT_REQUIRES_MANUAL_REVIEW` +
          ` sessionId=${sessionId}` +
          ` reservationIds=${docs.map((d) => d.id).join(",")}` +
          ` orderId=${opts?.orderId ?? "-"} amount=${opts?.amount ?? "-"}`,
      )
      return "ok" // nie wysyłaj zwykłego maila
    }

    // Zapis rezerwacji i płatności — brak połkniętych błędów
    try {
      for (const doc of docs) {
        await payload.update({
          collection: "reservations",
          id: doc.id,
          data: { paymentStatus: "paid", status: "confirmed" } as any,
          overrideAccess: true,
        })
        console.log(
          `[confirmGroupPayment] RESERVATION_CONFIRMED` +
            ` reservationId=${doc.id} reservationNumber=${doc.reservationNumber}` +
            ` type=${doc.type} sessionId=${sessionId}`,
        )
      }

      if (paymentDoc) {
        await payload.update({
          collection: "payments",
          id: paymentDoc.id,
          data: { status: "paid", p24OrderId: String(opts?.orderId ?? "") } as any,
          overrideAccess: true,
        })
      } else {
        const totalPLN = docs.reduce((acc, doc) => acc + Number(doc.depositAmount ?? 0), 0)
        await payload.create({
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
      }

      console.log(
        `[confirmGroupPayment] PAYMENT_MARKED_PAID` +
          ` sessionId=${sessionId}` +
          ` orderId=${opts?.orderId ?? "-"}` +
          ` amount=${opts?.amount ?? "-"}` +
          ` docs=${docs.length}`,
      )
    } catch (err: any) {
      console.error(
        `[confirmGroupPayment] PAYMENT_CRITICAL_DB_ERROR` +
          ` sessionId=${sessionId}` +
          ` reservationIds=${docs.map((d) => d.id).join(",")}` +
          ` orderId=${opts?.orderId ?? "-"}` +
          ` amount=${opts?.amount ?? "-"}` +
          ` error=${err?.message ?? String(err)}`,
      )
      return "db_error"
    }

    mailDocs = docs
    shouldSendMail = true
    return "ok"
  })

  // Mail wysyłamy POZA lockiem — nie blokujemy kolejnych callbacków
  if (shouldSendMail && mailDocs.length > 0) {
    try {
      const first = mailDocs[0]
      const type = first.type as string
      const clientEmail: string = first.customer?.email ?? ""
      const ownerEmail = getOwnerTo()
      const from = getMailFrom()
      const mail = getMailClient()

      const totalPLN = mailDocs.reduce((acc, doc) => acc + Number(doc.depositAmount ?? 0), 0)
      const reservationNumbers = (() => {
        const nums = mailDocs.flatMap((doc) => (doc.reservationNumber ? [String(doc.reservationNumber)] : []))
        return nums.length ? [...new Set(nums)] : [String(mailDocs[0]?.id ?? "")]
      })()

      if (type === "impreza" || type === "biznes") {
        const eventObj = typeof first.event === "object" ? first.event : null
        const eventTitle = eventObj?.title ?? "—"
        const dt = eventObj ? getEventDisplayDateTimePL(eventObj) : null
        const dateLabel =
          dt?.date ??
          (() => {
            const iso = String(first.day ?? "").slice(0, 10)
            const [y, m, d] = iso.split("-")
            return iso ? `${d}.${m}.${y}` : "—"
          })()
        const timeLabel =
          dt?.time ??
          (() => {
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
          console.log(`[confirmGroupPayment] CONFIRMATION_MAIL_SENT type=${type} to=${effectiveTo(clientEmail)} reservationNumber=${reservationNumber}`)
          await mail.emails.send({
            from,
            to: effectiveTo(clientEmail),
            subject: `Potwierdzenie rezerwacji: ${eventTitle} — ${reservationNumber}`,
            text: eventClientText({ ...emailParams, firstName: first.customer?.firstName ?? "" }),
            html: eventClientHtml({ ...emailParams, firstName: first.customer?.firstName ?? "" }),
          })
        }

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

        const segments = mailDocs.flatMap((doc) => {
          const segs = Array.isArray(doc.segments) ? (doc.segments as any[]) : []
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
          const resourceList = (doc.resources as any[]) ?? []
          const startHH = `${String(doc.startHour ?? 0).padStart(2, "0")}:${String(doc.startMinute ?? 0).padStart(2, "0")}`
          const endHH = `${String(doc.endHour ?? 0).padStart(2, "0")}:${String(doc.endMinute ?? 0).padStart(2, "0")}`
          const nums = resourceList
            .map((r: any) => (r && typeof r === "object" ? r.number : null))
            .filter((n: any) => n != null)
          if (!nums.length) {
            return [{ resourceLabel: laneType === "kregle" ? "Tor ?" : "Stół ?", startHH, endHH }]
          }
          return nums.map((num: any) => ({
            resourceLabel: laneType === "kregle" ? `Tor ${num}` : `Stół ${num}`,
            startHH,
            endHH,
          }))
        })

        if (clientEmail) {
          console.log(`[confirmGroupPayment] CONFIRMATION_MAIL_SENT type=${laneType} to=${effectiveTo(clientEmail)} reservationNumbers=${reservationNumbers.join(",")}`)
          await mail.emails.send({
            from,
            to: effectiveTo(clientEmail),
            subject: `Potwierdzenie rezerwacji — ${reservationNumbers[0]}`,
            text: bowlingClientText({
              type: laneType,
              reservationNumber: reservationNumbers[0],
              date: dateDisplay,
              segments,
              totalPLN,
              firstName: first.customer?.firstName ?? "",
            }),
            html: bowlingClientHtml({
              type: laneType,
              reservationNumber: reservationNumbers[0],
              date: dateDisplay,
              segments,
              totalPLN,
              firstName: first.customer?.firstName ?? "",
              paymentStatus: "paid",
            }),
          })
        }

        await mail.emails.send({
          from,
          to: effectiveTo(ownerEmail),
          subject: `Nowa rezerwacja (opłacona) — ${reservationNumbers.join(", ")}`,
          text: bowlingOwnerText({
            type: laneType,
            reservationNumbers,
            date: dateDisplay,
            segments,
            totalPLN,
            firstName: first.customer?.firstName ?? "",
            lastName: first.customer?.lastName ?? "",
            phone: first.customer?.phone ?? "—",
            email: clientEmail || "—",
          }),
          html: bowlingOwnerHtml({
            type: laneType,
            reservationNumbers,
            date: dateDisplay,
            segments,
            totalPLN,
            firstName: first.customer?.firstName ?? "",
            lastName: first.customer?.lastName ?? "",
            phone: first.customer?.phone ?? "—",
            email: clientEmail || "—",
          }),
        })
      }

      console.log(`[confirmGroupPayment] CONFIRMATION_MAIL_SENT sessionId=${sessionId}`)
    } catch (err) {
      console.error("[confirmGroupPayment] Błąd wysyłki maila:", err)
    }
  }

  return result
}
