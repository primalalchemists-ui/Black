import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const payload = await getPayload({ config })
    const now = new Date()

    // Znajdź rezerwacje które wygasły (pending + expiresAt < now)
    const expired = await payload.find({
      collection: "reservations",
      limit: 100,
      overrideAccess: true,
      where: {
        and: [
          { paymentStatus: { equals: "pending" } },
          { expiresAt: { less_than: now.toISOString() } },
        ],
      },
    })

    if (expired.docs.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    let updated = 0
    const errors: string[] = []

    for (const doc of expired.docs as any[]) {
      try {
        // Zaktualizuj rezerwację: cancelled + failed
        await payload.update({
          collection: "reservations",
          id: doc.id,
          overrideAccess: true,
          context: { skipConflictCheck: true },
          data: {
            status: "cancelled",
            paymentStatus: "failed",
          } as any,
        })

        // Zaktualizuj powiązaną płatność jeśli istnieje
        if (doc.groupId) {
          const payments = await payload.find({
            collection: "payments",
            limit: 10,
            overrideAccess: true,
            where: {
              and: [
                { p24SessionId: { equals: doc.groupId } },
                { status: { equals: "pending" } },
              ],
            },
          })

          for (const pmt of payments.docs as any[]) {
            await payload.update({
              collection: "payments",
              id: pmt.id,
              overrideAccess: true,
              context: { skipPaymentSync: true },
              data: { status: "failed" } as any,
            })
          }
        }

        updated++
        console.log(`[cron/expire] EXPIRED reservationId=${doc.id} groupId=${doc.groupId} expiresAt=${doc.expiresAt}`)
      } catch (err: any) {
        const msg = `id=${doc.id}: ${err?.message}`
        errors.push(msg)
        console.error(`[cron/expire] error ${msg}`)
      }
    }

    return NextResponse.json({ ok: true, updated, errors: errors.length > 0 ? errors : undefined })
  } catch (err: any) {
    console.error("[cron/expire] fatal:", err?.message ?? err)
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}
