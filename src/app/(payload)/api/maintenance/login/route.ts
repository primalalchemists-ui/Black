import { NextRequest, NextResponse } from "next/server"
import { MAINTENANCE_COOKIE, computeMaintenanceToken, maintenancePageHtml } from "@/lib/maintenanceAuth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const password = process.env.MAINTENANCE_PASSWORD
  const secret = process.env.PAYLOAD_SECRET

  if (!password || !secret) {
    return new NextResponse("Maintenance mode misconfigured.", { status: 503 })
  }

  let submitted = ""
  let redirectTo = "/"

  const ct = req.headers.get("content-type") ?? ""
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}))
    submitted = String(body.password ?? "")
    redirectTo = String(body.redirect ?? "/")
  } else {
    const form = await req.formData().catch(() => null)
    submitted = String(form?.get("password") ?? "")
    redirectTo = String(form?.get("redirect") ?? "/")
  }

  // Odrzuć absolute i protocol-relative redirects
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    redirectTo = "/"
  }

  if (submitted !== password) {
    const html = maintenancePageHtml({ redirectTo, error: "Nieprawidłowe hasło." })
    return new NextResponse(html, {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }

  const token = await computeMaintenanceToken(password, secret)
  // Używamy relatywnego Location żeby przeglądarka rozwiązała URL względem własnej domeny.
  // NextResponse.redirect(new URL(..., req.url)) użyłoby wewnętrznego adresu Dockera (0.0.0.0).
  const res = new NextResponse(null, { status: 303, headers: { Location: redirectTo } })
  res.cookies.set(MAINTENANCE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8 godzin
    path: "/",
  })
  return res
}
