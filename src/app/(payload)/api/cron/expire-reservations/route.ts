import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"
import { runExpirySweep } from "@/lib/reservationExpiry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Wygaszanie nieopłaconych rezerwacji — wariant dla schedulera.
 *
 * Scheduler NIE jest obecnie skonfigurowany (brak Railway Cron). Endpoint
 * zostaje gotowy do włączenia: wystarczy ustawić CRON_SECRET i wskazać
 * scheduler na ten URL. Do czasu włączenia głównym mechanizmem jest
 * admin-only sweep: POST /api/reservations/expire-pending.
 *
 * Oba wejścia korzystają z DOKŁADNIE TEJ SAMEJ logiki (runExpirySweep),
 * więc włączenie crona nie zmieni zachowania systemu.
 *
 * Uwaga: dostępność slotów NIE zależy od tego endpointu — wygasły hold jest
 * pomijany w zapytaniach o dostępność na podstawie expiresAt.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret")
  if (!secret || !process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  try {
    const payload = await getPayload({ config })
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
    console.error("[cron/expire] fatal:", err?.message ?? err)
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 })
  }
}
