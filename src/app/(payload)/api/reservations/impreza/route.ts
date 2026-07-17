import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"
import { z } from "zod"

import { getMailClient, getMailFrom, getOwnerTo, effectiveTo } from "@/lib/mail"
import { eventClientText, eventClientHtml, eventOwnerText, eventOwnerHtml } from "@/lib/mailTemplates"
import { getEventDisplayDateTimePL } from "@/lib/cms/events"
import { registerTransaction } from "@/lib/p24"
import { tryPaymentLock } from "@/lib/paymentLifecycle"
import { getNextReservationNumber } from "../_shared"
import { getBlockingEvent } from "@/lib/openingHours"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CONTACT_MSG = "Nie udało się przetworzyć rezerwacji. Skontaktuj się z obsługą lokalu: 601 275 261."
const PAYMENT_CONTACT_MSG = "Nie udało się przetworzyć płatności. Skontaktuj się z obsługą lokalu: 601 275 261."

const schema = z.object({
  eventId: z.string().min(1, "Brak eventId"),
  firstName: z.string().min(1, "Imię jest wymagane"),
  lastName: z.string().min(1, "Nazwisko jest wymagane"),
  phone: z.string().min(7, "Podaj numer telefonu"),
  email: z.string().email("Podaj poprawny adres e-mail"),
  partySize: z.number().int().min(1, "Minimalna liczba osób: 1"),
  notes: z.string().optional(),
  wantInvoice: z.boolean().optional(),
  invoiceType: z.string().optional(),
  nip: z.string().optional(),
  acceptRules: z.literal(true, { errorMap: () => ({ message: "Akceptacja regulaminu jest wymagana" }) }),
})

export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config })

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: "BAD_JSON", message: "Niepoprawne dane." }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
        { status: 400 },
      )
    }

    const data = parsed.data
    const eventId = data.eventId

    // 1. Pobierz event
    let event: any
    try {
      event = await payload.findByID({ collection: "events", id: eventId, overrideAccess: true, context: { skipTakenSeats: true } as any })
    } catch {
      return NextResponse.json({ error: "EVENT_NOT_FOUND", message: "Nie znaleziono wydarzenia." }, { status: 404 })
    }

    if (!event || !event.published || event.status !== "planned") {
      return NextResponse.json({ error: "NO_AVAILABILITY", message: "Wydarzenie niedostępne." }, { status: 409 })
    }

    if (!event.registrationsEnabled) {
      return NextResponse.json({ error: "NO_AVAILABILITY", message: "Zapisy na to wydarzenie są wyłączone." }, { status: 409 })
    }

    if (event.kind !== "impreza") {
      return NextResponse.json({ error: "NO_AVAILABILITY", message: "To wydarzenie nie obsługuje zapisów online." }, { status: 409 })
    }

    // Walidacja NIP tylko dla firmy
    if (data.wantInvoice && data.invoiceType === "company") {
      const nip = (data.nip ?? "").replace(/\D/g, "")
      if (nip.length !== 10) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", issues: [{ path: ["nip"], message: "NIP musi mieć 10 cyfr." }] },
          { status: 400 },
        )
      }
    }

    const pricePLN = typeof event.pricePLN === "number" ? event.pricePLN : 0
    const requiresPayment = pricePLN > 0
    const capacity = typeof event.capacity === "number" && event.capacity > 0 ? event.capacity : null

    // replaceSessionId: atomowe zastąpienie starej sesji — eliminuje race window przy ponownym submicie
    const replaceSessionId: string | null = typeof body?.replaceSessionId === "string" ? body.replaceSessionId.trim() || null : null
    let oldReservationId: number | null = null

    if (replaceSessionId && requiresPayment) {
      const validResult = await tryPaymentLock(payload, replaceSessionId, async () => {
        const oldRes = await payload.find({
          collection: "reservations",
          limit: 1,
          overrideAccess: true,
          where: {
            and: [
              { groupId: { equals: replaceSessionId } },
              { type: { equals: "impreza" } },
              { event: { equals: eventId } },
            ],
          },
        })
        if (!oldRes.docs.length) return { error: "REPLACE_NOT_FOUND" as const }
        const old = oldRes.docs[0] as any
        if ((old.customer?.email ?? "") !== (data.email ?? "")) return { error: "REPLACE_OWNERSHIP" as const }
        if (old.paymentStatus === "paid" || old.status === "confirmed") return { error: "REPLACE_PAID" as const }
        if (old.paymentStatus === "verifying") return { error: "REPLACE_VERIFYING" as const }
        if (old.paymentStatus !== "pending") return { error: "REPLACE_INVALID_STATUS" as const }
        const pmtCheck = await payload.find({
          collection: "payments",
          limit: 1,
          overrideAccess: true,
          where: { p24SessionId: { equals: replaceSessionId } },
        })
        if (pmtCheck.docs.length > 0) {
          const pmt = pmtCheck.docs[0] as any
          if (pmt.status === "paid" || pmt.status === "refunded") return { error: "REPLACE_PAID" as const }
        }
        return { oldId: old.id as number }
      })

      if (validResult === null) {
        return NextResponse.json({ error: "REPLACE_LOCKED", message: "Poprzednia sesja jest weryfikowana. Odczekaj chwilę i spróbuj ponownie." }, { status: 409 })
      }
      if ("error" in validResult) {
        const msgs: Record<string, string> = {
          REPLACE_NOT_FOUND: "Poprzednia sesja rezerwacji nie istnieje.",
          REPLACE_OWNERSHIP: "Adres e-mail nie pasuje do poprzedniej sesji.",
          REPLACE_PAID: "Poprzednia sesja została już opłacona.",
          REPLACE_VERIFYING: "Poprzednia sesja jest w trakcie weryfikacji płatności.",
          REPLACE_INVALID_STATUS: "Poprzednia sesja ma nieprawidłowy status.",
        }
        return NextResponse.json({ error: validResult.error, message: msgs[validResult.error] ?? "Błąd walidacji sesji poprzedniej." }, { status: 409 })
      }
      oldReservationId = validResult.oldId
    }

    // 2. Advisory lock per eventId — zapobiega race condition na capacity
    const lockKey = `event|${eventId}`
    let lockClient: any = null
    try {
      const dbPool = (payload.db as any)?.pool
      if (!dbPool?.connect) throw new Error("DB pool unavailable")
      lockClient = await dbPool.connect()
      await lockClient.query(`SELECT pg_advisory_lock(hashtext($1))`, [lockKey])
    } catch (lockErr) {
      console.error("[impreza] advisory lock error:", lockErr)
      if (lockClient) {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {})
        lockClient.release()
      }
      return NextResponse.json(
        { error: "SERVICE_UNAVAILABLE", message: "Nie udało się potwierdzić dostępności. Spróbuj ponownie za chwilę." },
        { status: 503 },
      )
    }

    let reservationDoc: any = null
    let groupId: string = ""
    let reservationNumber: string = ""

    try {
      // 3. Świeże sprawdzenie capacity wewnątrz locka (wyklucz wygasłe pending)
      if (capacity !== null) {
        const nowISO = new Date().toISOString()
        const takenDocs = await payload.find({
          collection: "reservations",
          limit: 5000,
          overrideAccess: true,
          where: {
            and: [
              { type: { equals: "impreza" } },
              { event: { equals: eventId } },
              { status: { in: ["new", "confirmed"] } },
              {
                or: [
                  { paymentStatus: { not_equals: "pending" } },
                  { expiresAt: { exists: false } },
                  { expiresAt: { greater_than_equal: nowISO } },
                ],
              } as any,
              // wyklucz własną sesję (replaceSessionId) — atomowy swap bez race window
              ...(replaceSessionId ? [{ groupId: { not_equals: replaceSessionId } }] : []) as any[],
            ],
          },
        })
        const takenSeats = (takenDocs.docs as any[]).reduce((sum, r) => sum + (Number(r.partySize) || 0), 0)
        if (takenSeats + data.partySize > capacity) {
          console.log(`[impreza] 409 capacity_exceeded eventId=${eventId} capacity=${capacity} takenSeats=${takenSeats} requested=${data.partySize}`)
          return NextResponse.json(
            { error: "NO_AVAILABILITY", message: "Brak wystarczającej liczby miejsc na to wydarzenie." },
            { status: 409 },
          )
        }
      }

      // 4. Sprawdź blokadę lokalu
      if (event.day) {
        const dayStr = new Date(event.day).toISOString().slice(0, 10)
        const blockCheck = await getBlockingEvent(
          dayStr,
          event.allDay ? undefined : Number(event.startHour ?? 0),
          event.allDay ? undefined : Number(event.startMinute ?? 0),
        )
        if (blockCheck.blocked && blockCheck.eventTitle !== event.title) {
          return NextResponse.json(
            { error: "VENUE_BLOCKED", message: "Lokal jest zarezerwowany na inne wydarzenie." },
            { status: 409 },
          )
        }
      }

      // 5. groupId + reservationNumber
      groupId = crypto.randomUUID()
      reservationNumber = await getNextReservationNumber(payload, "I")

      const dayISO = event.day ? new Date(event.day).toISOString() : new Date().toISOString()

      // 6. Stwórz rezerwację PRZED P24
      reservationDoc = await payload.create({
        collection: "reservations",
        overrideAccess: true,
        data: {
          type: "impreza",
          event: eventId,
          groupId,
          reservationNumber,
          customer: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, email: data.email },
          notes: data.notes || "",
          day: dayISO,
          allDay: Boolean(event.allDay),
          startHour: String(event.startHour ?? "18"),
          startMinute: String(event.startMinute ?? "0"),
          endHour: event.endHour != null ? String(event.endHour) : undefined,
          endMinute: event.endMinute != null ? String(event.endMinute) : undefined,
          startsAt: event.startsAt ?? dayISO,
          endsAt: event.endsAt ?? undefined,
          partySize: data.partySize,
          invoice: {
            wantInvoice: Boolean(data.wantInvoice),
            invoiceType: data.invoiceType || undefined,
            nip: data.nip || "",
          },
          acceptRules: true,
          source: "online",
          status: "new",
          paymentStatus: requiresPayment ? "pending" : "not_required",
          depositRequired: pricePLN > 0,
          depositAmount: pricePLN > 0 ? pricePLN * (requiresPayment ? data.partySize : 1) : 0,
          ...(requiresPayment ? { paymentProvider: "p24", expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() } : {}),
        } as any,
      })

      console.log(`[impreza] created reservationNumber=${reservationNumber} groupId=${groupId} eventId=${eventId} partySize=${data.partySize} requiresPayment=${requiresPayment}`)

      // 7. Płatność P24
      if (requiresPayment) {
        const amountGrosze = Math.round(pricePLN * data.partySize * 100)
        let createdPaymentId: number | null = null
        console.log(`[impreza] P24_REGISTER_STARTED reservationNumber=${reservationNumber} groupId=${groupId} amount=${amountGrosze}`)
        try {
          const p24Result = await registerTransaction({
            sessionId: groupId,
            amount: amountGrosze,
            description: `Impreza: ${event.title} (${data.partySize} os.)`,
            email: data.email,
          })
          console.log(`[impreza] P24_REGISTER_OK reservationNumber=${reservationNumber} groupId=${groupId}`)

          await payload.update({
            collection: "reservations",
            id: reservationDoc.id,
            overrideAccess: true,
            data: { depositAmount: amountGrosze / 100 } as any,
          })

          // Utwórz pending payment PRZED redirectem — sentinel chroniący przed cancel race
          try {
            const createdPayment = await payload.create({
              collection: "payments",
              overrideAccess: true,
              data: {
                provider: "p24",
                status: "pending",
                amount: amountGrosze / 100,
                currency: "PLN",
                p24SessionId: groupId,
                reservation: reservationDoc.id,
              } as any,
            })
            createdPaymentId = createdPayment.id
            console.log(`[impreza] PAYMENT_RECORD_CREATED reservationNumber=${reservationNumber} groupId=${groupId} amount=${amountGrosze / 100}`)
            await payload.update({ collection: "reservations", id: reservationDoc.id, overrideAccess: true, context: { skipConflictCheck: true } as any, data: { payment: createdPayment.id } as any }).catch(() => {})
          } catch (payErr: any) {
            console.error(`[impreza] PAYMENT_RECORD_CREATE_FAILED reservationNumber=${reservationNumber} groupId=${groupId}:`, payErr?.message)
          }

          // Re-lock + fresh read przed wygaszeniem starej sesji
          let replaceConflict: string | null = null
          if (replaceSessionId) {
            const expireResult = await tryPaymentLock(payload, replaceSessionId, async () => {
              const [freshResResult, freshPmtResult] = await Promise.all([
                payload.find({
                  collection: "reservations",
                  limit: 10,
                  overrideAccess: true,
                  where: {
                    and: [
                      { groupId: { equals: replaceSessionId } },
                      { type: { equals: "impreza" } },
                      { event: { equals: eventId } },
                    ],
                  },
                }),
                payload.find({
                  collection: "payments",
                  limit: 1,
                  overrideAccess: true,
                  where: { p24SessionId: { equals: replaceSessionId } },
                }),
              ])
              const pmt = (freshPmtResult.docs[0] as any) ?? null
              const pmtBlocked = pmt && (pmt.status === "paid" || pmt.status === "refunded")
              const resBlocked = (freshResResult.docs as any[]).some(
                r => r.paymentStatus === "paid" || r.paymentStatus === "verifying" || r.status === "confirmed"
              )
              if (pmtBlocked || resBlocked) {
                return { conflict: pmtBlocked ? "payment_paid" : "reservation_blocked" } as const
              }
              const nowISO = new Date().toISOString()
              let expiredCount = 0
              for (const oldDoc of freshResResult.docs as any[]) {
                if (oldDoc.paymentStatus === "pending") {
                  try {
                    await payload.update({
                      collection: "reservations",
                      id: oldDoc.id,
                      overrideAccess: true,
                      data: { expiresAt: nowISO } as any,
                    })
                    expiredCount++
                  } catch (perErr: any) {
                    console.error(`[impreza] REPLACE_EXPIRE_DOC_FAILED id=${oldDoc.id}:`, perErr?.message)
                  }
                }
              }
              return { ok: true as const, expiredCount }
            })

            if (expireResult === null) {
              console.error(`[impreza] CRITICAL REPLACE_EXPIRE_LOCK_UNAVAILABLE replaceSessionId=${replaceSessionId} oldId=${oldReservationId} newId=${reservationDoc.id} newRN=${reservationNumber} — callback aktywny podczas wygaszenia`)
              replaceConflict = "lock_unavailable"
            } else if ("conflict" in expireResult) {
              console.error(`[impreza] CRITICAL REPLACE_PAID_DURING_SWAP replaceSessionId=${replaceSessionId} oldId=${oldReservationId} conflict=${expireResult.conflict} newId=${reservationDoc.id} newRN=${reservationNumber} — stara sesja opłacona podczas swapa, manual review needed`)
              replaceConflict = expireResult.conflict
            } else {
              console.log(`[impreza] REPLACE_OLD_EXPIRED replaceSessionId=${replaceSessionId} oldId=${oldReservationId} count=${expireResult.expiredCount} newId=${reservationDoc.id} newRN=${reservationNumber}`)
            }
          }

          if (replaceConflict) {
            const abandonNow = new Date().toISOString()
            let resExpired = false
            let pmtMarkedFailed = false
            try {
              await payload.update({
                collection: "reservations",
                id: reservationDoc.id,
                overrideAccess: true,
                data: { expiresAt: abandonNow, status: "cancelled", paymentStatus: "failed" } as any,
              })
              resExpired = true
            } catch (e: any) {
              console.error(`[impreza] CRITICAL REPLACE_CONFLICT_EXPIRE_FAILED newId=${reservationDoc.id} — slot NIE zwolniony, fallback expiresAt=${reservationDoc.expiresAt ?? "brak"}:`, e?.message)
            }
            if (createdPaymentId !== null) {
              try {
                await payload.update({
                  collection: "payments",
                  id: createdPaymentId,
                  overrideAccess: true,
                  data: { status: "failed" } as any,
                })
                pmtMarkedFailed = true
              } catch (e: any) {
                console.error(`[impreza] CRITICAL REPLACE_CONFLICT_PAYMENT_FAILED pmtId=${createdPaymentId}:`, e?.message)
              }
            }
            if (resExpired) {
              console.error(`[impreza] CRITICAL REPLACE_CONFLICT_NEW_ABANDONED newId=${reservationDoc.id} newRN=${reservationNumber} newPmtId=${createdPaymentId ?? "none"} pmtFailed=${pmtMarkedFailed} p24SessionId=${groupId} replaceConflict=${replaceConflict} — slot zwolniony natychmiast`)
            } else {
              console.error(`[impreza] CRITICAL REPLACE_CONFLICT_SLOT_NOT_FREED newId=${reservationDoc.id} newRN=${reservationNumber} newPmtId=${createdPaymentId ?? "none"} p24SessionId=${groupId} replaceConflict=${replaceConflict} — slot NIE zwolniony, fallback expiresAt=${reservationDoc.expiresAt ?? "brak"}`)
            }
            return NextResponse.json({
              error: replaceConflict === "lock_unavailable" ? "REPLACE_BUSY" : "REPLACE_PAID_DURING_SWAP",
              message: replaceConflict === "lock_unavailable"
                ? "Poprzednia płatność jest właśnie weryfikowana. Odczekaj chwilę i sprawdź e-mail."
                : "Twoja poprzednia płatność właśnie się powiodła. Sprawdź e-mail z potwierdzeniem rezerwacji.",
            }, { status: 409 })
          }

          return NextResponse.json({ ok: true, redirectUrl: p24Result.payUrl, groupId, reservationNumber })
        } catch (p24Err: any) {
          // registerTransaction failed — zachowaj rezerwację jako anulowaną (audit trail)
          console.error(`[impreza] P24_REGISTER_FAILED reservationNumber=${reservationNumber} groupId=${groupId}:`, p24Err?.message ?? p24Err)
          await payload.update({
            collection: "reservations",
            id: reservationDoc.id,
            overrideAccess: true,
            data: { status: "cancelled", paymentStatus: "failed" } as any,
          }).catch((e) => console.error("[impreza] rollback update failed:", e))
          return NextResponse.json({ error: "PAYMENT_ERROR", message: PAYMENT_CONTACT_MSG }, { status: 502 })
        }
      }
    } finally {
      if (lockClient) {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => {})
        lockClient.release()
      }
    }

    // 8. Darmowe — wyślij maile od razu
    const dt = getEventDisplayDateTimePL(event)
    try {
      const mail = getMailClient()
      const from = getMailFrom()
      const ownerTo = getOwnerTo()

      const emailParams = {
        type: "impreza" as const,
        reservationNumber,
        eventTitle: event.title,
        dateLabel: dt?.date ?? "—",
        timeLabel: dt?.time ?? "—",
        partySize: data.partySize,
        totalPLN: pricePLN,
        paymentStatus: "not_required" as const,
      }

      await mail.emails.send({
        from,
        to: effectiveTo(data.email),
        subject: `Potwierdzenie zapisu: ${event.title} — ${reservationNumber}`,
        text: eventClientText({ ...emailParams, firstName: data.firstName }),
        html: eventClientHtml({ ...emailParams, firstName: data.firstName }),
      })

      await mail.emails.send({
        from,
        to: effectiveTo(ownerTo),
        subject: `Nowy zapis — Impreza: ${event.title}`,
        text: eventOwnerText({
          ...emailParams,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email,
          wantInvoice: Boolean(data.wantInvoice),
          invoiceType: data.invoiceType ?? "",
          nip: data.nip ?? "",
          notes: data.notes ?? "",
        }),
        html: eventOwnerHtml({
          ...emailParams,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          email: data.email,
          wantInvoice: Boolean(data.wantInvoice),
          invoiceType: data.invoiceType ?? "",
          nip: data.nip ?? "",
          notes: data.notes ?? "",
        }),
        reply_to: data.email,
      })
    } catch (mailErr: any) {
      console.warn("[impreza] mail skipped:", mailErr?.message ?? mailErr)
    }

    return NextResponse.json({ ok: true, groupId, reservationNumber })
  } catch (err: any) {
    console.error("[impreza] POST error:", err?.message ?? err)
    return NextResponse.json({ error: "INTERNAL_ERROR", message: CONTACT_MSG }, { status: 500 })
  }
}
