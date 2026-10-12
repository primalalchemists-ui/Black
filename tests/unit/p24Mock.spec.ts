import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

import { registerTransaction, verifyTransaction } from "@/lib/p24"

/**
 * Izolacja trybu mock Przelewy24.
 *
 * Luka: `apiBase()` było zdefiniowane jako `isSandbox() ? SANDBOX_BASE : PROD_BASE`.
 * Przy P24_ENV=mock `isSandbox()` jest false, więc `verifyTransaction` wysyłało
 * PUT na PRODUKCYJNE API Przelewy24 (`secure.przelewy24.pl`) — ze stagingu,
 * z produkcyjnym adresem, mimo trybu mock.
 *
 * Te testy pilnują, że w trybie mock nie wychodzi ŻADNE żądanie do P24 —
 * ani na produkcję, ani na sandbox — i że mock nigdy nie potwierdza płatności.
 */

const P24_HOSTS = /przelewy24\.pl/i

const ARGS = { sessionId: "sess-test-1", orderId: 12345, amount: 1000 }

let fetchMock: ReturnType<typeof vi.fn>
let envBefore: Record<string, string | undefined>

function urlsCalled(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]))
}

beforeEach(() => {
  envBefore = {
    P24_ENV: process.env.P24_ENV,
    P24_MERCHANT_ID: process.env.P24_MERCHANT_ID,
    P24_POS_ID: process.env.P24_POS_ID,
    P24_CRC: process.env.P24_CRC,
    P24_API_KEY: process.env.P24_API_KEY,
    P24_RETURN_URL: process.env.P24_RETURN_URL,
  }

  process.env.P24_MERCHANT_ID = "111111"
  process.env.P24_POS_ID = "111111"
  process.env.P24_CRC = "test-crc"
  process.env.P24_API_KEY = "test-api-key"
  process.env.P24_RETURN_URL = "http://localhost:3000/rezerwacje/podziekowanie"

  // Każde wyjście na zewnątrz przechodzi przez tę atrapę — realna sieć
  // nie jest dotykana w żadnym teście.
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  for (const [k, v] of Object.entries(envBefore)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─── Tryb mock: zero ruchu do P24 ───────────────────────────────────────────

describe("P24_ENV=mock — brak jakiegokolwiek ruchu do API P24", () => {
  beforeEach(() => {
    process.env.P24_ENV = "mock"
  })

  it("verifyTransaction NIE wywołuje fetch", async () => {
    await expect(verifyTransaction(ARGS)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("verifyTransaction odrzuca jawnym komunikatem o trybie mock", async () => {
    await expect(verifyTransaction(ARGS)).rejects.toThrow(/mock/i)
  })

  it("verifyTransaction NIGDY nie zwraca true (brak cichego potwierdzenia płatności)", async () => {
    const result = await verifyTransaction(ARGS).then(
      (v) => ({ resolved: true as const, v }),
      () => ({ resolved: false as const, v: undefined }),
    )
    expect(result.resolved).toBe(false)
    expect(result.v).not.toBe(true)
  })

  it("registerTransaction NIE wywołuje fetch i zwraca lokalny payUrl", async () => {
    const res = await registerTransaction({
      sessionId: ARGS.sessionId,
      amount: ARGS.amount,
      description: "Test",
      email: "test@example.com",
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(res.token).toContain("MOCK-")
    expect(res.payUrl).not.toMatch(P24_HOSTS)
    expect(res.payUrl).toContain("/rezerwacje/podziekowanie")
  })

  it("żadna z funkcji P24 nie dotyka hosta przelewy24.pl", async () => {
    await registerTransaction({
      sessionId: ARGS.sessionId,
      amount: ARGS.amount,
      description: "Test",
      email: "test@example.com",
    })
    await verifyTransaction(ARGS).catch(() => {})

    expect(urlsCalled().filter((u) => P24_HOSTS.test(u))).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ─── Sandbox i produkcja: zachowanie bez zmian ──────────────────────────────

describe("P24_ENV=sandbox — ruch kierowany na sandbox", () => {
  beforeEach(() => {
    process.env.P24_ENV = "sandbox"
  })

  it("verifyTransaction uderza w sandbox i zwraca wynik operatora", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: "success" } }),
    })

    await expect(verifyTransaction(ARGS)).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(urlsCalled()[0]).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/verify")
    expect(urlsCalled()[0]).not.toContain("secure.przelewy24.pl")
  })

  it("verifyTransaction zwraca false, gdy operator nie potwierdza", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: "rejected" } }),
    })

    await expect(verifyTransaction(ARGS)).resolves.toBe(false)
  })

  it("registerTransaction uderza w sandbox", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { token: "TOKEN-1" } }),
    })

    const res = await registerTransaction({
      sessionId: ARGS.sessionId,
      amount: ARGS.amount,
      description: "Test",
      email: "test@example.com",
    })

    expect(urlsCalled()[0]).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/register")
    expect(res.payUrl).toBe("https://sandbox.przelewy24.pl/trnRequest/TOKEN-1")
  })
})

describe("P24_ENV=production — ruch kierowany na produkcję", () => {
  beforeEach(() => {
    process.env.P24_ENV = "production"
  })

  it("verifyTransaction uderza w produkcyjne API", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { status: "success" } }),
    })

    await expect(verifyTransaction(ARGS)).resolves.toBe(true)
    expect(urlsCalled()[0]).toBe("https://secure.przelewy24.pl/api/v1/transaction/verify")
  })

  it("błąd HTTP operatora propaguje się jako wyjątek", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    })

    await expect(verifyTransaction(ARGS)).rejects.toThrow(/401/)
  })
})

// ─── Regresja luki ──────────────────────────────────────────────────────────

describe("regresja: mock nie może wyciec na adres produkcyjny", () => {
  it("stara logika apiBase (isSandbox ? sandbox : prod) wybierała produkcję w trybie mock", () => {
    const SANDBOX = "https://sandbox.przelewy24.pl/api/v1"
    const PROD = "https://secure.przelewy24.pl/api/v1"
    const stary = (env: string) => (env === "sandbox" ? SANDBOX : PROD)

    // To jest dokładnie ta luka: tryb mock trafiał na produkcję.
    expect(stary("mock")).toBe(PROD)
  })

  it("obecna implementacja w trybie mock w ogóle nie dochodzi do wyboru adresu", async () => {
    process.env.P24_ENV = "mock"
    await expect(verifyTransaction(ARGS)).rejects.toThrow()
    expect(urlsCalled()).toEqual([])
  })
})
