import { NextRequest, NextResponse } from "next/server"
import { MAINTENANCE_COOKIE, computeMaintenanceToken, maintenancePageHtml } from "@/lib/maintenanceAuth"

// Matcher wyklucza /api/* i /_next/* z maintenance check.
// Dzięki temu:
//   • RSC server-side fetche do /api/* działają bez ciasteczka (nie dostają HTML maintenance)
//   • /api/payments/p24/status (callback P24) jest zawsze dostępny
//   • /api/maintenance/login i /api/maintenance/logout są zawsze dostępne
// Strony frontendowe i /admin są nadal chronione.

export async function middleware(req: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "true") return NextResponse.next()

  const { pathname } = req.nextUrl

  const password = process.env.MAINTENANCE_PASSWORD
  const secret = process.env.PAYLOAD_SECRET

  if (!password || !secret) {
    console.error(
      "[MAINTENANCE] MAINTENANCE_MODE=true ale MAINTENANCE_PASSWORD lub PAYLOAD_SECRET nie jest ustawione — cały ruch zablokowany",
    )
    return new NextResponse("503 Service Unavailable: maintenance mode misconfigured.", { status: 503 })
  }

  const cookieToken = req.cookies.get(MAINTENANCE_COOKIE)?.value
  if (cookieToken) {
    const expected = await computeMaintenanceToken(password, secret)
    if (cookieToken === expected) return NextResponse.next()
  }

  const html = maintenancePageHtml({ redirectTo: pathname + req.nextUrl.search })
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export const config = {
  // Wyklucza /api/*, /_next/*, favicon — nigdy nie pokazuj im strony maintenance.
  // /api/payments/p24/status i /api/maintenance/* są wykluczone przez ten matcher.
  matcher: ["/((?!api/|_next/|favicon\\.ico).*)"],
}
