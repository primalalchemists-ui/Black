import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"
import { findExpirableReservations, runExpirySweep } from "@/lib/reservationExpiry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_ROLES = ["admin", "staff"]

/**
 * Admin-only sweep wygasłych rezerwacji.
 *
 * Wywoływany przez panel przy wejściu/odświeżeniu listy rezerwacji.
 * Świadomie POST (mutacja) z uwierzytelnieniem — NIE powtarzamy antywzorca
 * mutowania bazy w GET/server renderze.
 *
 * Ta sama logika co endpoint cronowy (runExpirySweep). Jeśli sweep się nie
 * wykona (401, błąd sieci, admin nie wszedł do panelu), NIE ma to żadnego
 * wpływu na dostępność slotów — ta liczona jest z expiresAt niezależnie
 * od statusu rekordu.
 */

// GET — tylko podgląd licznika, bez mutacji.
export async function GET(req: Request) {
  try {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: req.headers as any })
    if (!user || !ALLOWED_ROLES.includes((user as any).role)) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const docs = await findExpirableReservations(payload, { limit: 200 })
    return NextResponse.json({ ok: true, count: docs.length })
  } catch (err: any) {
    console.error("[expire-pending GET] error:", err?.message ?? err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}

// POST — właściwy sweep.
export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: req.headers as any })
    if (!user || !ALLOWED_ROLES.includes((user as any).role)) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const result = await runExpirySweep(payload, { limit: 200 })

    return NextResponse.json({
      ok: true,
      updated: result.updated,
      scanned: result.scanned,
      skippedLocked: result.skippedLocked,
      skippedPaymentSettled: result.skippedPaymentSettled,
      ...(result.errors.length > 0 ? { errors: result.errors } : {}),
    })
  } catch (err: any) {
    console.error("[expire-pending POST] error:", err?.message ?? err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
