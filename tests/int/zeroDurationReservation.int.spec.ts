import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getPayload } from "payload"
import config from "@payload-config"

import { assertIsolatedTestDatabase } from "../helpers/isolatedTestDatabase"

/**
 * Regresja: rezerwacja zerowej długości (`endsAt === startsAt`).
 *
 * Hook `beforeValidate` w kolekcji `reservations` wyprowadza `startsAt`
 * i `endsAt` z `day` + godzin. Warunek odrzucający zerową długość obejmował
 * wcześniej tylko typy „kregle" i „bilard", więc dla stolika, imprezy
 * i biznesu takie wejście przechodziło po cichu: `endsAt` równe `startsAt`
 * nie blokuje niczego, bo każde sprawdzenie nakładania się zwraca wtedy false.
 * Rezerwacja wyglądała na zapisaną, a termin zostawał wolny.
 *
 * Walidacja jest w `beforeValidate`, czyli przed walidacją pól — dlatego
 * odrzucenie następuje niezależnie od tego, jakie inne pola podamy.
 *
 * Zakres testu jest celowo wąski: tylko ta walidacja plus dowód, że
 * rezerwacje przechodzące przez północ nadal działają.
 */

assertIsolatedTestDatabase()

let payload: Awaited<ReturnType<typeof getPayload>>

const ALL_TYPES = ["stolik", "kregle", "bilard", "impreza", "biznes"] as const

const DAY = "2027-03-19T12:00:00.000Z"

const CUSTOMER = {
  firstName: "Jan",
  lastName: "Testowy",
  phone: "500100200",
  email: "klient.fikcyjny@example.invalid",
}

function base(type: string) {
  return {
    type,
    day: DAY,
    customer: CUSTOMER,
    status: "new",
    paymentStatus: "not_required",
  } as Record<string, unknown>
}

/** Zwraca rzucony błąd albo null, gdy zapis się udał. */
async function attempt(data: Record<string, unknown>): Promise<unknown> {
  try {
    await payload.create({ collection: "reservations", overrideAccess: true, data: data as never })
    return null
  } catch (err) {
    return err
  }
}

const ZERO_DURATION_MESSAGE = "Koniec rezerwacji musi być inny niż początek"

beforeAll(async () => {
  payload = await getPayload({ config })
}, 180_000)

afterAll(async () => {
  const pool = (payload?.db as any)?.pool
  if (pool?.end) await Promise.race([pool.end(), new Promise((r) => setTimeout(r, 2000))])
})

describe("rezerwacja zerowej długości jest odrzucana", () => {
  for (const type of ALL_TYPES) {
    it(`${type}: 18:00–18:00 jest odrzucane`, async () => {
      const err = await attempt({
        ...base(type),
        startHour: "18",
        startMinute: "0",
        endHour: "18",
        endMinute: "0",
      })

      expect(err, `typ ${type} nie powinien dać się zapisać`).not.toBeNull()
      const message = err instanceof Error ? err.message : String(err)
      expect(message, `komunikat dla ${type}: ${message}`).toContain(ZERO_DURATION_MESSAGE)
    }, 60_000)
  }

  it("odrzucenie dotyczy też innej godziny niż 18:00", async () => {
    const err = await attempt({
      ...base("stolik"),
      startHour: "9",
      startMinute: "30",
      endHour: "9",
      endMinute: "30",
    })
    expect(err).not.toBeNull()
    expect(err instanceof Error ? err.message : String(err)).toContain(ZERO_DURATION_MESSAGE)
  }, 60_000)

  it("zerowa długość o północy też jest odrzucana", async () => {
    const err = await attempt({
      ...base("stolik"),
      startHour: "0",
      startMinute: "0",
      endHour: "0",
      endMinute: "0",
    })
    expect(err).not.toBeNull()
    expect(err instanceof Error ? err.message : String(err)).toContain(ZERO_DURATION_MESSAGE)
  }, 60_000)
})

describe("przejście przez północ działa dalej", () => {
  it("22:00–02:00 przechodzi i kończy się następnego dnia", async () => {
    const err = await attempt({
      ...base("stolik"),
      startHour: "22",
      startMinute: "0",
      endHour: "2",
      endMinute: "0",
    })
    expect(err, `nie powinno rzucić: ${err instanceof Error ? err.message : err}`).toBeNull()

    const found = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { and: [{ type: { equals: "stolik" } }, { startHour: { equals: "22" } }] },
      sort: "-createdAt",
      limit: 1,
    })
    const doc = found.docs[0] as any
    expect(doc, "rezerwacja powinna istnieć").toBeTruthy()

    const start = new Date(doc.startsAt)
    const end = new Date(doc.endsAt)
    expect(end.getTime(), "koniec musi być po początku").toBeGreaterThan(start.getTime())
    expect(end.getTime() - start.getTime(), "22:00→02:00 to 4 godziny").toBe(4 * 60 * 60 * 1000)
    expect(end.getUTCDate(), "koniec wypada następnego dnia").toBe(start.getUTCDate() + 1)
  }, 60_000)

  /*
   * Typ „stolik", nie „kregle" — kręgle wymagają pola „Zasoby (tory / stoły)",
   * więc zapis trafiałby w walidację pól, nie w badane wyprowadzanie godzin.
   * Rolowanie przez północ w tym hooku nie zależy od typu, a ścieżkę kręgli
   * i bilarda pokrywa `tests/int/midnight.int.spec.ts`.
   */
  it("23:00–00:00 przechodzi i kończy się o północy następnego dnia", async () => {
    const err = await attempt({
      ...base("stolik"),
      startHour: "23",
      startMinute: "0",
      endHour: "0",
      endMinute: "0",
    })
    expect(err, `nie powinno rzucić: ${err instanceof Error ? err.message : err}`).toBeNull()

    const found = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { and: [{ type: { equals: "stolik" } }, { startHour: { equals: "23" } }] },
      sort: "-createdAt",
      limit: 1,
    })
    const doc = found.docs[0] as any
    const start = new Date(doc.startsAt)
    const end = new Date(doc.endsAt)
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000)
    expect(end.getUTCHours()).toBe(0)
    expect(end.getUTCDate()).toBe(start.getUTCDate() + 1)
  }, 60_000)

  it("zwykły przedział 17:00–18:00 nadal przechodzi", async () => {
    const err = await attempt({
      ...base("stolik"),
      startHour: "17",
      startMinute: "0",
      endHour: "18",
      endMinute: "0",
    })
    expect(err, `nie powinno rzucić: ${err instanceof Error ? err.message : err}`).toBeNull()
  }, 60_000)
})
