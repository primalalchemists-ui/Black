import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { getPayload } from "payload"
import config from "@payload-config"

import { POST as kreglePOST } from "@/app/(payload)/api/reservations/kregle/route"
import { confirmGroupPayment } from "@/lib/reservationConfirm"
import { assertIsolatedTestDatabase } from "../helpers/isolatedTestDatabase"

/**
 * Mail potwierdzający po opłaceniu rezerwacji.
 *
 * Ten mail wychodzi dopiero przy `paymentStatus = paid`, a `P24_ENV=mock`
 * nigdy nie potwierdza płatności. Zamiast tworzyć publiczny endpoint
 * obchodzący weryfikację P24 — czego robić nie wolno — wywołujemy wprost
 * `confirmGroupPayment(sessionId, { skipP24Verify: true })`. Ta opcja już
 * istnieje w kodzie i jest dostępna wyłącznie po stronie serwera.
 *
 * Test działa w `EMAIL_MODE=mock`, więc nic nie opuszcza procesu. Sprawdza,
 * że ścieżka potwierdzenia NAPRAWDĘ próbuje wysłać dwie wiadomości i do kogo
 * je adresuje. Samo przekierowanie adresatów w trybie `test` pokrywa
 * `tests/unit/mailPolicy.spec.ts`.
 */

assertIsolatedTestDatabase()

let payload: Awaited<ReturnType<typeof getPayload>>

const CLIENT_EMAIL = "klient.fikcyjny@example.invalid"
const OWNER_EMAIL = "wlasciciel.testowy@example.invalid"

/** Data w przyszłości, w piątek — piątki są otwarte do północy. */
function upcomingFriday(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const DATE = upcomingFriday()

function bookingRequest(resource: number, hour: number) {
  return new Request("http://localhost/api/reservations/kregle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "kregle",
      date: DATE,
      startHour: hour,
      endHour: hour,
      resources: [resource],
      segments: [{ resource, startHour: hour, endHour: hour }],
      totalPrice: 0,
      firstName: "Jan",
      lastName: "Testowy",
      phone: "500100200",
      email: CLIENT_EMAIL,
      acceptRules: true,
      acceptPrivacyPolicy: true,
      wantInvoice: false,
    }),
  })
}

beforeAll(async () => {
  process.env.EMAIL_MODE = "mock"
  process.env.MAIL_TO_OWNER = OWNER_EMAIL
  process.env.P24_ENV = "mock"

  payload = await getPayload({ config })

  await payload.updateGlobal({
    slug: "site-settings",
    overrideAccess: true,
    data: {
      name: "Black Test",
      openingHours: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (key) => ({ key, open: "10:00", close: "00:00" }),
      ),
    } as any,
  })

  // Cena > 0, żeby rezerwacja trafiła na ścieżkę płatności i czekała na paid.
  await payload.updateGlobal({
    slug: "reservation-settings",
    overrideAccess: true,
    data: {
      bowling: {
        enabled: true,
        pricePerHour: 100,
        reservationStartAfterOpeningMinutes: 0,
        latestReservationStartBeforeClosingMinutes: 0,
      },
    } as any,
  })

  for (const n of [1, 2, 3]) {
    const existing = await payload.find({
      collection: "resources",
      overrideAccess: true,
      where: { and: [{ type: { equals: "lane" } }, { number: { equals: n } }] },
      limit: 1,
    })
    if (existing.docs.length === 0) {
      await payload.create({
        collection: "resources",
        overrideAccess: true,
        data: { type: "lane", number: n, label: `Tor ${n}`, active: true } as any,
      })
    }
  }
}, 180_000)

afterAll(async () => {
  const pool = (payload?.db as any)?.pool
  if (pool?.end) await Promise.race([pool.end(), new Promise((r) => setTimeout(r, 2000))])
})

describe("mail potwierdzający po opłaceniu", () => {
  it("confirmGroupPayment ustawia paid i wysyła dwie wiadomości", async () => {
    const res = await kreglePOST(bookingRequest(3, 20) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    const sessionId: string = body.groupId
    expect(sessionId, "ścieżka z segments musi zwrócić groupId").toBeTruthy()

    // Przed potwierdzeniem: oczekuje płatności.
    const before = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { groupId: { equals: sessionId } },
      limit: 10,
    })
    expect(before.docs.length).toBeGreaterThan(0)
    expect((before.docs[0] as any).paymentStatus).toBe("pending")

    // Przechwytujemy log atrapy poczty — w trybie mock nic nie wychodzi z procesu.
    const logged: string[] = []
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "))
    })

    try {
      const result = await confirmGroupPayment(sessionId, { skipP24Verify: true })
      expect(result).toBeTruthy()
    } finally {
      spy.mockRestore()
    }

    const after = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { groupId: { equals: sessionId } },
      limit: 10,
    })
    expect((after.docs[0] as any).paymentStatus).toBe("paid")

    const mails = logged.filter((line) => line.includes("MAIL WOULD BE SENT"))
    expect(mails.length, "spodziewane dwie wiadomości: klient i właściciel").toBe(2)

    const joined = logged.join("\n")
    expect(joined).toContain(CLIENT_EMAIL)
    expect(joined).toContain(OWNER_EMAIL)
  }, 120_000)

  it("powtórne potwierdzenie nie wysyła maila drugi raz", async () => {
    const res = await kreglePOST(bookingRequest(3, 18) as never)
    expect(res.status).toBe(200)
    const { groupId } = await res.json()

    await confirmGroupPayment(groupId, { skipP24Verify: true })

    const logged: string[] = []
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logged.push(args.map(String).join(" "))
    })
    try {
      await confirmGroupPayment(groupId, { skipP24Verify: true })
    } finally {
      spy.mockRestore()
    }

    const mails = logged.filter((line) => line.includes("MAIL WOULD BE SENT"))
    expect(mails.length, "druga próba potwierdzenia nie może wysłać maila").toBe(0)
  }, 120_000)
})
