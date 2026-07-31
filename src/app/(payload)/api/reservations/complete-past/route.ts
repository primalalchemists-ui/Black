import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["admin", "staff"]

async function findQualifying(payload: any, now: Date) {
  const result = await payload.find({
    collection: "reservations",
    limit: 1000,
    overrideAccess: true,
    where: {
      and: [
        { status: { equals: "confirmed" } },
        { endsAt: { less_than: now.toISOString() } },
      ],
    },
  })
  return result.docs as any[]
}

// GET /api/reservations/complete-past — licznik kwalifikujących się
export async function GET(req: Request) {
  try {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: req.headers as any })
    if (!user || !ALLOWED_ROLES.includes((user as any).role)) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const now = new Date()
    const docs = await findQualifying(payload, now)
    return NextResponse.json({ ok: true, count: docs.length })
  } catch (err: any) {
    console.error("[complete-past GET] error:", err?.message ?? err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// POST /api/reservations/complete-past — zbiorcze zakończenie
export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: req.headers as any })
    if (!user || !ALLOWED_ROLES.includes((user as any).role)) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const now = new Date()
    // Fresh read — nie opieramy się na liczbie z frontendu
    const docs = await findQualifying(payload, now)

    if (docs.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 })
    }

    let updated = 0
    const errors: string[] = []

    for (const doc of docs) {
      if (!doc.endsAt) {
        console.warn(`[complete-past] SKIP id=${doc.id} type=${doc.type} — brak endsAt`)
        continue
      }

      try {
        await payload.update({
          collection: "reservations",
          id: doc.id,
          overrideAccess: true,
          context: { skipConflictCheck: true },
          data: { status: "completed" } as any,
        })
        updated++
        console.log(`[complete-past] COMPLETED id=${doc.id} type=${doc.type} endsAt=${doc.endsAt}`)
      } catch (err: any) {
        const msg = `id=${doc.id}: ${err?.message}`
        errors.push(msg)
        console.error(`[complete-past] ERROR ${msg}`)
      }
    }

    return NextResponse.json({
      ok: true,
      updated,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (err: any) {
    console.error("[complete-past POST] error:", err?.message ?? err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
