import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"

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

    // Don't cancel if P24 callback already arrived (payment record exists = user paid)
    const paymentCheck = await payload.find({
      collection: "payments",
      limit: 1,
      overrideAccess: true,
      where: { p24SessionId: { equals: sessionId } },
    })
    if (paymentCheck.docs.length > 0) {
      return NextResponse.json({ ok: true, cancelled: 0, reason: "already_paid" })
    }

    const result = await payload.find({
      collection: "reservations",
      limit: 20,
      overrideAccess: true,
      where: {
        and: [
          { groupId: { equals: sessionId } },
          { paymentStatus: { equals: "pending" } },
        ],
      },
    })

    let cancelled = 0
    for (const doc of result.docs as any[]) {
      try {
        await payload.delete({ collection: "reservations", id: doc.id, overrideAccess: true })
        cancelled++
      } catch (err: any) {
        console.error("[cancel] delete failed, cancelling:", err?.message)
        await payload
          .update({
            collection: "reservations",
            id: doc.id,
            overrideAccess: true,
            data: { status: "cancelled", paymentStatus: "failed" } as any,
          })
          .catch(() => {})
        cancelled++
      }
    }

    console.log(`[cancel] sessionId=${sessionId} cancelled=${cancelled}`)
    return NextResponse.json({ ok: true, cancelled })
  } catch (err: any) {
    console.error("[cancel] error:", err?.message ?? err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
