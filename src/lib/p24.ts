import crypto from "crypto"

const SANDBOX_BASE = "https://sandbox.przelewy24.pl/api/v1"
const PROD_BASE = "https://secure.przelewy24.pl/api/v1"
const SANDBOX_PAY = "https://sandbox.przelewy24.pl/trnRequest"
const PROD_PAY = "https://secure.przelewy24.pl/trnRequest"

function getEnv() {
  return process.env.P24_ENV ?? "sandbox"
}
function isMock() { return getEnv() === "mock" }
function isSandbox() { return getEnv() === "sandbox" }

function apiBase() { return isSandbox() ? SANDBOX_BASE : PROD_BASE }
function payBase() { return isSandbox() ? SANDBOX_PAY : PROD_PAY }
function merchantId() { return Number(process.env.P24_MERCHANT_ID ?? 0) }
function posId() { return Number(process.env.P24_POS_ID || process.env.P24_MERCHANT_ID || 0) }
function crc() { return process.env.P24_CRC ?? "" }
function apiKey() { return process.env.P24_API_KEY ?? "" }

function sha384(data: string) {
  return crypto.createHash("sha384").update(data).digest("hex")
}

function authHeader() {
  return "Basic " + Buffer.from(`${posId()}:${apiKey()}`).toString("base64")
}

function signRegister(sessionId: string, amount: number) {
  return sha384(JSON.stringify({ sessionId, merchantId: merchantId(), amount, currency: "PLN", crc: crc() }))
}

function signVerify(sessionId: string, orderId: number, amount: number) {
  return sha384(JSON.stringify({ sessionId, orderId, amount, currency: "PLN", crc: crc() }))
}

export function verifyCallbackSign(params: {
  merchantId: number
  posId: number
  sessionId: string
  amount: number
  originAmount: number
  currency: string
  orderId: number
  methodId: number
  statement: string
  sign: string
}): boolean {
  const { sign, ...fields } = params
  const expected = sha384(JSON.stringify({ ...fields, crc: crc() }))
  return expected === sign
}

export async function registerTransaction(params: {
  sessionId: string
  amount: number
  description: string
  email: string
}): Promise<{ token: string; payUrl: string }> {
  // Tryb mock (P24_ENV=mock) — tylko do lokalnego developmentu bez konta P24.
  // Przekierowuje na stronę podziękowania ze statusem "pending" (bez potwierdzenia, bez maila).
  if (isMock()) {
    console.log(`[P24 MOCK] registerTransaction sessionId=${params.sessionId} amount=${params.amount}`)
    const returnBase = process.env.P24_RETURN_URL ?? "http://localhost:3000/rezerwacje/podziekowanie"
    const returnUrl = new URL(returnBase)
    returnUrl.searchParams.set("sessionId", params.sessionId)
    return { token: `MOCK-${params.sessionId}`, payUrl: returnUrl.toString() }
  }

  // Prawdziwe API P24 (sandbox lub produkcja)
  const returnBase = process.env.P24_RETURN_URL ?? ""
  const returnUrl = returnBase
    ? (() => {
        const u = new URL(returnBase)
        u.searchParams.set("sessionId", params.sessionId)
        return u.toString()
      })()
    : ""

  const sign = signRegister(params.sessionId, params.amount)
  const body = {
    merchantId: merchantId(),
    posId: posId(),
    sessionId: params.sessionId,
    amount: params.amount,
    currency: "PLN",
    description: params.description,
    email: params.email,
    country: "PL",
    language: "pl",
    urlReturn: returnUrl,
    urlStatus: process.env.P24_STATUS_URL ?? "",
    sign,
  }

  console.log(
    `[P24] registerTransaction` +
    ` env=${getEnv()}` +
    ` endpoint=${apiBase()}/transaction/register` +
    ` merchantId=${merchantId()}` +
    ` posId=${posId()}` +
    ` apiKeyLen=${process.env.P24_API_KEY?.length ?? 0}` +
    ` crcLen=${process.env.P24_CRC?.length ?? 0}` +
    ` ordersKeyLen=${process.env.P24_ORDERS_KEY?.length ?? 0}` +
    ` authUser=P24_POS_ID(${posId()})` +
    ` authPassSource=P24_API_KEY` +
    ` sessionId=${params.sessionId}` +
    ` amount=${params.amount}`
  )

  const res = await fetch(`${apiBase()}/transaction/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[P24] registerTransaction failed (${res.status}): ${text}`)
    throw new Error(`P24 register failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as any
  const token: string = json?.data?.token
  if (!token) throw new Error(`P24 register: brak tokenu. Odpowiedź: ${JSON.stringify(json)}`)

  const payUrl = `${payBase()}/${token}`
  console.log(`[P24] registerTransaction OK token=${token} payUrl=${payUrl}`)
  return { token, payUrl }
}

export async function verifyTransaction(params: {
  sessionId: string
  orderId: number
  amount: number
}): Promise<boolean> {
  console.log(`[P24] verifyTransaction env=${getEnv()} sessionId=${params.sessionId} orderId=${params.orderId} amount=${params.amount}`)

  const sign = signVerify(params.sessionId, params.orderId, params.amount)
  const body = {
    merchantId: merchantId(),
    posId: posId(),
    sessionId: params.sessionId,
    amount: params.amount,
    currency: "PLN",
    orderId: params.orderId,
    sign,
  }

  const res = await fetch(`${apiBase()}/transaction/verify`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[P24] verifyTransaction failed (${res.status}): ${text}`)
    throw new Error(`P24 verify failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as any
  const ok = json?.data?.status === "success"
  console.log(`[P24] verifyTransaction result=${ok} data=${JSON.stringify(json?.data)}`)
  return ok
}
