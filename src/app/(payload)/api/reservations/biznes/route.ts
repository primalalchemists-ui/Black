import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"
import { z } from "zod"

import { getMailClient, getMailFrom, getOwnerTo, effectiveTo } from "@/lib/mail"
import { eventClientText, eventClientHtml, eventOwnerText, eventOwnerHtml } from "@/lib/mailTemplates"
import { getEventDisplayDateTimePL } from "@/lib/cms/events"
import { registerTransaction } from "@/lib/p24"
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
  partySize: z.number().int().min(1, "Minimalna liczba osób: 1").optional().default(1),
  notes: z.string().optional(),
  disabledPerson: z.boolean().optional(),
  disabilityDetails: z.string().optional(),
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
      console.log(`[biznes] 409 event_unavailable eventId=${eventId} published=${event?.published} status=${event?.status}`)
      return NextResponse.json({ error: "NO_AVAILABILITY", message: "Wydarzenie niedostępne." }, { status: 409 })
    }

    if (!event.registrationsEnabled) {
      console.log(`[biznes] 409 registrations_disabled eventId=${eventId}`)
      return NextResponse.json({ error: "NO_AVAILABILITY", message: "Zapisy na to wydarzenie są wyłączone." }, { status: 409 })
    }

    if (event.kind !== "biznes") {
      console.log(`[biznes] 409 wrong_kind eventId=${eventId} kind=${event.kind}`)
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

    // 2. Sprawdź capacity (partySize-based)
    const capacity = typeof event.capacity === "number" && event.capacity > 0 ? event.capacity : null
    if (capacity !== null) {
      const takenDocs = await payload.find({
        collection: "reservations",
        limit: 5000,
        overrideAccess: true,
        where: {
          and: [
            { type: { equals: "biznes" } },
            { event: { equals: eventId } },
            { status: { in: ["new", "confirmed"] } },
          ],
        },
      })
      const takenSeats = (takenDocs.docs as any[]).reduce((sum, r) => sum + (Number(r.partySize) || 1), 0)
      if (takenSeats + (data.partySize ?? 1) > capacity) {
        console.log(`[biznes] 409 capacity_exceeded eventId=${eventId} capacity=${capacity} takenSeats=${takenSeats} requested=${data.partySize ?? 1}`)
        return NextResponse.json(
          { error: "NO_AVAILABILITY", message: "Brak wystarczającej liczby miejsc na to wydarzenie." },
          { status: 409 },
        )
      }
    }

    // 3. Sprawdź blokadę lokalu
    if (event.day) {
      const dayStr = new Date(event.day).toISOString().slice(0, 10)
      const blockCheck = await getBlockingEvent(
        dayStr,
        event.allDay ? undefined : Number(event.startHour ?? 0),
        event.allDay ? undefined : Number(event.startMinute ?? 0),
      )
      if (blockCheck.blocked && blockCheck.eventTitle !== event.title) {
        console.log(`[biznes] 409 venue_blocked eventId=${eventId} blockingEvent="${blockCheck.eventTitle}" thisEvent="${event.title}"`)
        return NextResponse.json(
          { error: "VENUE_BLOCKED", message: "Lokal jest zarezerwowany na inne wydarzenie." },
          { status: 409 },
        )
      }
    }

    // 4. groupId + reservationNumber
    const groupId = crypto.randomUUID()
    const reservationNumber = await getNextReservationNumber(payload, "W")

    const pricePLN = typeof event.pricePLN === "number" ? event.pricePLN : 0
    const requiresPayment = pricePLN > 0

    const startsAt = event.startsAt ? new Date(event.startsAt) : null
    const endsAt = event.endsAt ? new Date(event.endsAt) : null
    const dayISO = event.day ? new Date(event.day).toISOString() : (startsAt?.toISOString() ?? new Date().toISOString())

    // 5. Stwórz rezerwację
    const reservationDoc = await payload.create({
      collection: "reservations",
      overrideAccess: true,
      data: {
        type: "biznes",
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
        startsAt: startsAt?.toISOString() ?? dayISO,
        endsAt: endsAt?.toISOString() ?? undefined,
        partySize: data.partySize ?? 1,
        disabledPerson: Boolean(data.disabledPerson),
        disabilityDetails: data.disabilityDetails || "",
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
        depositAmount: pricePLN > 0 ? pricePLN * (data.partySize ?? 1) : 0,
        ...(requiresPayment ? { paymentProvider: "p24" } : {}),
      } as any,
    })

    console.log(`[biznes] created reservationNumber=${reservationNumber} groupId=${groupId} eventId=${eventId} requiresPayment=${requiresPayment}`)

    // 6. Płatność P24
    if (requiresPayment) {
      const amountGrosze = Math.round(pricePLN * (data.partySize ?? 1) * 100)
      try {
        const p24Result = await registerTransaction({
          sessionId: groupId,
          amount: amountGrosze,
          description: `Biznes: ${event.title}`,
          email: data.email,
        })

        console.log(`[biznes] P24 payUrl=${p24Result.payUrl} groupId=${groupId}`)
        return NextResponse.json({ ok: true, redirectUrl: p24Result.payUrl, groupId, reservationNumber })
      } catch (p24Err: any) {
        console.error("[biznes] P24 error:", p24Err?.message ?? p24Err)
        await payload.delete({ collection: "reservations", id: reservationDoc.id, overrideAccess: true }).catch(() => {})
        return NextResponse.json({ error: "PAYMENT_ERROR", message: PAYMENT_CONTACT_MSG }, { status: 502 })
      }
    }

    // 7. Darmowe lub płatność na miejscu — wyślij maile od razu
    const dt = getEventDisplayDateTimePL(event)
    try {
      const mail = getMailClient()
      const from = getMailFrom()
      const ownerTo = getOwnerTo()

      const emailParams = {
        type: "biznes" as const,
        reservationNumber,
        eventTitle: event.title,
        dateLabel: dt?.date ?? "—",
        timeLabel: dt?.time ?? "—",
        partySize: data.partySize ?? 1,
        totalPLN: pricePLN * (data.partySize ?? 1),
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
        subject: `Nowy zapis — Biznes: ${event.title}`,
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
      console.warn("[biznes] mail skipped:", mailErr?.message ?? mailErr)
    }

    return NextResponse.json({ ok: true, groupId, reservationNumber })
  } catch (err: any) {
    console.error("[biznes] POST error:", err?.message ?? err)
    return NextResponse.json({ error: "INTERNAL_ERROR", message: CONTACT_MSG }, { status: 500 })
  }
}
