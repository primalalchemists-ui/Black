// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

import { middleware } from "@/middleware"
import {
  STAGING_COOKIE,
  STAGING_HEADER,
  computeStagingToken,
  internalFetchHeaders,
  isAlwaysAllowedPath,
  isStagingProtectionEnabled,
} from "@/lib/stagingAccess"

/**
 * Testy bezpieczeństwa bramki stagingowej.
 *
 * Sprawdzają realną funkcję `middleware`, a nie jej odwzorowanie — żądania są
 * budowane jako NextRequest i przepuszczane przez tę samą ścieżkę co w runtime.
 */

const KEY = "staging-key-do-testow"
const SECRET = "payload-secret-do-testow"

/** Marker, który `NextResponse.next()` dokłada do odpowiedzi. */
function passedThrough(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1"
}

function req(path: string, init: { method?: string; headers?: Record<string, string>; cookie?: string } = {}) {
  const headers = new Headers(init.headers ?? {})
  if (init.cookie) headers.set("cookie", init.cookie)
  return new NextRequest(`https://staging.example.com${path}`, {
    method: init.method ?? "GET",
    headers,
  })
}

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {
    STAGING_PROTECTION: process.env.STAGING_PROTECTION,
    STAGING_ACCESS_KEY: process.env.STAGING_ACCESS_KEY,
    STAGING_ALLOW_P24_WEBHOOK: process.env.STAGING_ALLOW_P24_WEBHOOK,
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
    MAINTENANCE_PASSWORD: process.env.MAINTENANCE_PASSWORD,
    PAYLOAD_SECRET: process.env.PAYLOAD_SECRET,
  }
  for (const k of Object.keys(saved)) delete process.env[k]
  process.env.PAYLOAD_SECRET = SECRET
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

// ─── Domyślnie wyłączona: produkcja bez zmian ───────────────────────────────

describe("ochrona wyłączona — zachowanie produkcji niezmienione", () => {
  it("isStagingProtectionEnabled domyślnie false", () => {
    expect(isStagingProtectionEnabled({})).toBe(false)
    expect(isStagingProtectionEnabled({ STAGING_PROTECTION: "1" })).toBe(false)
    expect(isStagingProtectionEnabled({ STAGING_PROTECTION: "TRUE" })).toBe(false)
    expect(isStagingProtectionEnabled({ STAGING_PROTECTION: "true" })).toBe(true)
  })

  it("przepuszcza strony, admina i API bez żadnych poświadczeń", async () => {
    for (const path of ["/", "/rezerwacje/kregle", "/admin", "/api/reservations/kregle"]) {
      const res = await middleware(req(path))
      expect(passedThrough(res), path).toBe(true)
    }
  })

  it("przepuszcza mutacje API", async () => {
    const res = await middleware(req("/api/reservations/kregle", { method: "POST" }))
    expect(passedThrough(res)).toBe(true)
  })

  it("internalFetchHeaders nie dokłada nic poza stagingiem", () => {
    expect(internalFetchHeaders({})).toEqual({})
    expect(internalFetchHeaders({ STAGING_ACCESS_KEY: KEY })).toEqual({})
  })
})

// ─── Fail closed ────────────────────────────────────────────────────────────

describe("fail closed przy brakującej konfiguracji", () => {
  it("brak STAGING_ACCESS_KEY → 503 dla wszystkiego", async () => {
    process.env.STAGING_PROTECTION = "true"
    for (const path of ["/", "/admin", "/api/reservations/kregle"]) {
      const res = await middleware(req(path))
      expect(res.status, path).toBe(503)
    }
  })

  it("brak PAYLOAD_SECRET → 503", async () => {
    process.env.STAGING_PROTECTION = "true"
    process.env.STAGING_ACCESS_KEY = KEY
    delete process.env.PAYLOAD_SECRET
    const res = await middleware(req("/"))
    expect(res.status).toBe(503)
  })

  it("nie otwiera ruchu po cichu — 503 nie jest przepuszczeniem", async () => {
    process.env.STAGING_PROTECTION = "true"
    const res = await middleware(req("/api/reservations/kregle", { method: "POST" }))
    expect(passedThrough(res)).toBe(false)
    expect(res.status).toBe(503)
  })
})

// ─── Blokowanie bez poświadczeń ─────────────────────────────────────────────

describe("ochrona włączona — żądania bez poświadczeń", () => {
  beforeEach(() => {
    process.env.STAGING_PROTECTION = "true"
    process.env.STAGING_ACCESS_KEY = KEY
  })

  it("strona frontendu → 401 ze stroną logowania", async () => {
    const res = await middleware(req("/rezerwacje/kregle"))
    expect(res.status).toBe(401)
    expect(res.headers.get("content-type")).toContain("text/html")
    expect(await res.text()).toContain("Środowisko testowe")
  })

  it("panel Payload → 401", async () => {
    const res = await middleware(req("/admin"))
    expect(res.status).toBe(401)
    expect(passedThrough(res)).toBe(false)
  })

  it("GET API → 401 JSON, nie HTML", async () => {
    const res = await middleware(req("/api/reservations/kregle?date=2026-12-01"))
    expect(res.status).toBe(401)
    expect(res.headers.get("content-type")).toContain("application/json")
    expect(await res.json()).toEqual({ ok: false, error: "STAGING_UNAUTHORIZED" })
  })

  it("MUTACJE rezerwacji i płatności nie docierają do handlera", async () => {
    const mutations: Array<[string, string]> = [
      ["POST", "/api/reservations/kregle"],
      ["POST", "/api/reservations/bilard"],
      ["POST", "/api/reservations/stoliki"],
      ["POST", "/api/reservations/impreza"],
      ["POST", "/api/reservations/biznes"],
      ["POST", "/api/reservations/cancel"],
      ["POST", "/api/payments/p24/status"],
      ["POST", "/api/cron/expire-reservations"],
      ["DELETE", "/api/reservations/1"],
      ["PATCH", "/api/reservations/1"],
    ]
    for (const [method, path] of mutations) {
      const res = await middleware(req(path, { method }))
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(passedThrough(res), `${method} ${path}`).toBe(false)
    }
  })

  it("błędny klucz w nagłówku nie przepuszcza", async () => {
    const res = await middleware(req("/", { headers: { [STAGING_HEADER]: "zly-klucz" } }))
    expect(res.status).toBe(401)
  })

  it("błędne ciasteczko nie przepuszcza", async () => {
    const res = await middleware(req("/", { cookie: `${STAGING_COOKIE}=nieprawidlowy` }))
    expect(res.status).toBe(401)
  })
})

// ─── Poświadczenia poprawne ─────────────────────────────────────────────────

describe("ochrona włączona — żądania uwierzytelnione", () => {
  beforeEach(() => {
    process.env.STAGING_PROTECTION = "true"
    process.env.STAGING_ACCESS_KEY = KEY
  })

  it("nagłówek z kluczem przepuszcza (Playwright, fetche wewnętrzne)", async () => {
    for (const path of ["/", "/admin", "/api/reservations/kregle"]) {
      const res = await middleware(req(path, { headers: { [STAGING_HEADER]: KEY } }))
      expect(passedThrough(res), path).toBe(true)
    }
  })

  it("ciasteczko po zalogowaniu przepuszcza, także panel", async () => {
    const token = await computeStagingToken(KEY, SECRET)
    for (const path of ["/", "/admin", "/admin/collections/reservations"]) {
      const res = await middleware(req(path, { cookie: `${STAGING_COOKIE}=${token}` }))
      expect(passedThrough(res), path).toBe(true)
    }
  })

  it("nagłówek przepuszcza mutacje", async () => {
    const res = await middleware(
      req("/api/reservations/kregle", { method: "POST", headers: { [STAGING_HEADER]: KEY } }),
    )
    expect(passedThrough(res)).toBe(true)
  })

  it("internalFetchHeaders dokłada nagłówek tylko przy włączonej ochronie", () => {
    expect(internalFetchHeaders({ STAGING_PROTECTION: "true", STAGING_ACCESS_KEY: KEY })).toEqual({
      [STAGING_HEADER]: KEY,
    })
    expect(internalFetchHeaders({ STAGING_PROTECTION: "true" })).toEqual({})
  })
})

// ─── Ścieżki zawsze dozwolone ───────────────────────────────────────────────

describe("wyjątki ścieżkowe", () => {
  beforeEach(() => {
    process.env.STAGING_PROTECTION = "true"
    process.env.STAGING_ACCESS_KEY = KEY
  })

  it("endpoint logowania jest osiągalny bez poświadczeń", async () => {
    const res = await middleware(req("/api/staging/login", { method: "POST" }))
    expect(passedThrough(res)).toBe(true)
  })

  it("webhook P24 jest DOMYŚLNIE zablokowany", async () => {
    const res = await middleware(req("/api/payments/p24/status", { method: "POST" }))
    expect(res.status).toBe(401)
  })

  it("webhook P24 otwiera się dopiero po jawnym włączeniu", async () => {
    process.env.STAGING_ALLOW_P24_WEBHOOK = "true"
    const res = await middleware(req("/api/payments/p24/status", { method: "POST" }))
    expect(passedThrough(res)).toBe(true)
  })

  it("włączenie webhooka P24 NIE otwiera innych endpointów", async () => {
    process.env.STAGING_ALLOW_P24_WEBHOOK = "true"
    for (const path of ["/api/reservations/kregle", "/api/payments", "/admin", "/"]) {
      const res = await middleware(req(path, { method: "POST" }))
      expect(res.status, path).toBe(401)
    }
  })

  it("isAlwaysAllowedPath nie dopuszcza ścieżek zbliżonych", () => {
    const env = { STAGING_ALLOW_P24_WEBHOOK: "true" }
    expect(isAlwaysAllowedPath("/api/payments/p24/status", env)).toBe(true)
    expect(isAlwaysAllowedPath("/api/payments/p24/status/extra", env)).toBe(false)
    expect(isAlwaysAllowedPath("/api/staging/login", env)).toBe(true)
    expect(isAlwaysAllowedPath("/api/staging/loginx", env)).toBe(false)
  })
})

// ─── Współistnienie z trybem maintenance ────────────────────────────────────

describe("tryb maintenance — zakres niezmieniony", () => {
  it("maintenance nadal NIE obejmuje /api/* (zachowanie jak przed zmianą)", async () => {
    process.env.MAINTENANCE_MODE = "true"
    process.env.MAINTENANCE_PASSWORD = "haslo"
    const res = await middleware(req("/api/reservations/kregle"))
    expect(passedThrough(res)).toBe(true)
  })

  it("maintenance nadal zasłania strony frontendu", async () => {
    process.env.MAINTENANCE_MODE = "true"
    process.env.MAINTENANCE_PASSWORD = "haslo"
    const res = await middleware(req("/"))
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("Prace techniczne")
  })

  it("gdy oba tryby włączone, staging rozstrzyga pierwszy", async () => {
    process.env.MAINTENANCE_MODE = "true"
    process.env.MAINTENANCE_PASSWORD = "haslo"
    process.env.STAGING_PROTECTION = "true"
    process.env.STAGING_ACCESS_KEY = KEY
    const res = await middleware(req("/api/reservations/kregle", { method: "POST" }))
    expect(res.status).toBe(401)
  })
})
