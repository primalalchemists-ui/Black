import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"
import { tryPaymentLock } from "@/lib/paymentLifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : ""
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "MISSING_SESSION_ID" }, { status: 400 })
    }

    const payload = await getPayload({ config })

    // Szybka ścieżka: jeśli płatność została już zatwierdzona — nie anuluj.
    // Payment pending = normalny stan po registerTransaction, nie oznacza że płatność wykonana.
    const paymentCheck = await payload.find({
      collection: "payments",
      limit: 1,
      overrideAccess: true,
      where: { p24SessionId: { equals: sessionId } },
    })
    if (paymentCheck.docs.length > 0) {
      const payment = paymentCheck.docs[0] as any
      if (payment.status === "paid" || payment.status === "refunded") {
        console.log(`[cancel] CANCEL_SKIPPED_PAYMENT_PAID sessionId=${sessionId} paymentStatus=${payment.status}`)
        return NextResponse.json({ ok: true, expired: 0, reason: "payment_paid" })
      }
      // payment.status = "pending" → można zwolnić hold (expiresAt = now), pod lockiem
    }

    // tryPaymentLock: nie blokuj jeśli callback jest w trakcie przetwarzania.
    // Callback trzyma blokadę ~5s; jeśli nie możemy jej uzyskać, expiresAt i tak wygaśnie slot.
    const lockResult = await tryPaymentLock(payload, sessionId, async () => {
      // Świeży odczyt wewnątrz blokady
      const result = await payload.find({
        collection: "reservations",
        limit: 20,
        overrideAccess: true,
        where: {
          and: [
            { groupId: { equals: sessionId } },
            { paymentStatus: { in: ["pending", "verifying"] } },
          ],
        },
      })

      let expired = 0
      for (const doc of result.docs as any[]) {
        // Świeży odczyt wewnątrz locka — sprawdź paymentStatus i status rezerwacji
        if (doc.paymentStatus === "verifying") {
          console.log(`[cancel] CANCEL_SKIPPED_VERIFYING reservationId=${doc.id} reservationNumber=${doc.reservationNumber} sessionId=${sessionId}`)
          continue
        }

        if (doc.paymentStatus === "paid" || doc.status === "confirmed") {
          console.log(`[cancel] CANCEL_SKIPPED_PAID reservationId=${doc.id} paymentStatus=${doc.paymentStatus} status=${doc.status} sessionId=${sessionId}`)
          continue
        }

        if (doc.paymentStatus !== "pending") {
          console.log(`[cancel] CANCEL_SKIPPED_OTHER reservationId=${doc.id} paymentStatus=${doc.paymentStatus} sessionId=${sessionId}`)
          continue
        }

        // Ustaw expiresAt = teraz → slot natychmiast wolny, rekord zostaje w bazie
        try {
          await payload.update({
            collection: "reservations",
            id: doc.id,
            overrideAccess: true,
            data: { expiresAt: new Date().toISOString() } as any,
          })
          expired++
          console.log(`[cancel] PENDING_EXPIRED reservationId=${doc.id} reservationNumber=${doc.reservationNumber} sessionId=${sessionId}`)
        } catch (err: any) {
          console.error(`[cancel] expire failed id=${doc.id}:`, err?.message)
        }
      }

      console.log(`[cancel] sessionId=${sessionId} expired=${expired}`)
      return expired
    })

    if (lockResult === null) {
      // Lock niedostępny — callback jest w trakcie, expiresAt zwolni slot automatycznie
      console.log(`[cancel] CANCEL_LOCK_UNAVAILABLE sessionId=${sessionId} — callback in progress, expiresAt will expire slot`)
      return NextResponse.json({ ok: true, expired: 0, reason: "lock_unavailable" })
    }

    return NextResponse.json({ ok: true, expired: lockResult })
  } catch (err: any) {
    console.error("[cancel] error:", err?.message ?? err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
