import { NextRequest, NextResponse } from "next/server"
import { STAGING_COOKIE, computeStagingToken, stagingLoginPageHtml } from "@/lib/stagingAccess"

export const dynamic = "force-dynamic"

/**
 * Logowanie do środowiska staging.
 *
 * Ten endpoint jest jedną z nielicznych ścieżek przepuszczanych przez bramkę
 * (patrz `isAlwaysAllowedPath`) — inaczej nie dałoby się zalogować.
 *
 * Ciasteczko przechowuje HMAC klucza, nie sam klucz, i jest httpOnly.
 */
export async function POST(req: NextRequest) {
  const key = process.env.STAGING_ACCESS_KEY
  const secret = process.env.PAYLOAD_SECRET

  if (!key || !secret) {
    return new NextResponse("Staging protection misconfigured.", { status: 503 })
  }

  let submitted = ""
  let redirectTo = "/"

  const ct = req.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}))
    submitted = String((body as Record<string, unknown>).key ?? "")
    redirectTo = String((body as Record<string, unknown>).redirect ?? "/")
  } else {
    const form = await req.formData().catch(() => null)
    submitted = String(form?.get("key") ?? "")
    redirectTo = String(form?.get("redirect") ?? "/")
  }

  // Odrzuć absolutne i protocol-relative przekierowania (open redirect).
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    redirectTo = "/"
  }

  // Porównanie po HMAC — długość porównywanych ciągów nie zależy od wejścia.
  const expected = await computeStagingToken(key, secret)
  const provided = await computeStagingToken(submitted, secret)

  if (provided !== expected) {
    return new NextResponse(
      stagingLoginPageHtml({ redirectTo, error: "Nieprawidłowy klucz dostępu." }),
      { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }

  // Relatywny Location — NextResponse.redirect(new URL(..., req.url)) użyłby
  // wewnętrznego adresu kontenera.
  const res = new NextResponse(null, { status: 303, headers: { Location: redirectTo } })
  res.cookies.set(STAGING_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // 12 godzin
    path: "/",
  })
  return res
}
