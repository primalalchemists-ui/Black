import { NextResponse } from "next/server"
import { verifyCallbackSign } from "@/lib/p24"
import { confirmGroupPayment } from "@/lib/reservationConfirm"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let body: any = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ status: "ok" })
  }

  const { merchantId, posId, sessionId, amount, originAmount, currency, orderId, methodId, statement, sign } = body ?? {}

  const signOk = sessionId && orderId != null && amount != null && sign && verifyCallbackSign({
    merchantId: Number(merchantId),
    posId: Number(posId),
    sessionId: String(sessionId),
    amount: Number(amount),
    originAmount: Number(originAmount ?? amount),
    currency: String(currency ?? "PLN"),
    orderId: Number(orderId),
    methodId: Number(methodId ?? 0),
    statement: String(statement ?? ""),
    sign: String(sign),
  })

  if (!signOk) {
    console.error("[P24 callback] Nieprawidłowy podpis lub brakujące pola", { sessionId, orderId, amount })
    return NextResponse.json({ status: "ok" })
  }

  const result = await confirmGroupPayment(String(sessionId), {
    orderId: Number(orderId),
    amount: Number(amount),
  })

  // db_error: P24 verify succeeded but DB save failed.
  // Return 500 so P24 retries the callback (up to 3 times over 24h).
  // confirmGroupPayment is idempotent — retry is safe.
  if (result === "db_error") {
    console.error(`[P24 callback] P24_CALLBACK_DB_ERROR_WILL_RETRY sessionId=${sessionId} orderId=${orderId}`)
    return NextResponse.json({ status: "error" }, { status: 500 })
  }

  return NextResponse.json({ status: "ok" })
}
