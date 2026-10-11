import { NextRequest, NextResponse } from "next/server"
import { MAINTENANCE_COOKIE, computeMaintenanceToken, maintenancePageHtml } from "@/lib/maintenanceAuth"
import {
  STAGING_COOKIE,
  STAGING_HEADER,
  computeStagingToken,
  isAlwaysAllowedPath,
  isStagingProtectionEnabled,
  stagingLoginPageHtml,
} from "@/lib/stagingAccess"

// Matcher wyklucza /_next/*, /images/* i favicon — zasoby statyczne nigdy nie
// są bramkowane. /images/* musi być wykluczone, bo optymalizator obrazów Next
// pobiera lokalny plik wewnętrznym żądaniem HTTP bez ciasteczka; zablokowanie
// go dałoby 400 w /_next/image.
//
// W odróżnieniu od poprzedniej wersji matcher NIE wyklucza /api/* — bramka
// stagingowa musi obejmować także endpointy rezerwacji i płatności. Zakres
// trybu maintenance pozostaje jednak dokładnie taki jak wcześniej: jest on
// pomijany dla /api/*, więc zachowanie produkcji się nie zmienia.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  const stagingResponse = await applyStagingGate(req, pathname)
  if (stagingResponse) return stagingResponse

  const maintenanceResponse = await applyMaintenanceGate(req, pathname)
  if (maintenanceResponse) return maintenanceResponse

  return NextResponse.next()
}

/**
 * Bramka stagingowa. Zwraca odpowiedź, jeśli żądanie ma zostać zatrzymane;
 * null, gdy może iść dalej.
 */
async function applyStagingGate(req: NextRequest, pathname: string): Promise<NextResponse | null> {
  if (!isStagingProtectionEnabled()) return null

  const key = process.env.STAGING_ACCESS_KEY
  const secret = process.env.PAYLOAD_SECRET

  // Fail closed — włączona ochrona bez konfiguracji blokuje wszystko,
  // zamiast po cichu przepuścić ruch.
  if (!key || !secret) {
    console.error(
      "[STAGING] STAGING_PROTECTION=true, ale brakuje STAGING_ACCESS_KEY lub PAYLOAD_SECRET — ruch zablokowany",
    )
    return new NextResponse("503 Service Unavailable: staging protection misconfigured.", {
      status: 503,
    })
  }

  if (isAlwaysAllowedPath(pathname)) return null

  const expected = await computeStagingToken(key, secret)

  // 1) Nagłówek — Playwright i wewnętrzne fetche serwer→własne API.
  const headerKey = req.headers.get(STAGING_HEADER)
  if (headerKey) {
    const provided = await computeStagingToken(headerKey, secret)
    if (provided === expected) return null
  }

  // 2) Ciasteczko — przeglądarka po zalogowaniu.
  if (req.cookies.get(STAGING_COOKIE)?.value === expected) return null

  // API dostaje JSON 401, nie stronę HTML — inaczej klient dostałby HTML
  // tam, gdzie oczekuje JSON-a. Żądanie nie dociera do handlera.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "STAGING_UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    )
  }

  return new NextResponse(stagingLoginPageHtml({ redirectTo: pathname + req.nextUrl.search }), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

/**
 * Tryb maintenance — zachowanie bez zmian względem poprzedniej wersji,
 * łącznie z pominięciem /api/*.
 */
async function applyMaintenanceGate(req: NextRequest, pathname: string): Promise<NextResponse | null> {
  if (process.env.MAINTENANCE_MODE !== "true") return null

  // Zakres jak dotąd: /api/* nigdy nie dostaje strony maintenance.
  if (pathname.startsWith("/api/")) return null

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
    if (cookieToken === expected) return null
  }

  return new NextResponse(maintenancePageHtml({ redirectTo: pathname + req.nextUrl.search }), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export const config = {
  matcher: ["/((?!_next/|images/|favicon\\.ico).*)"],
}
