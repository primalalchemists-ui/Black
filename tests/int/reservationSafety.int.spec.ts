import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getPayload } from "payload"
import config from "@payload-config"

import { POST as kreglePOST } from "@/app/(payload)/api/reservations/kregle/route"
import { POST as bilardPOST } from "@/app/(payload)/api/reservations/bilard/route"
import { assertIsolatedTestDatabase } from "../helpers/isolatedTestDatabase"

/**
 * Regresja dla dwóch luk w trasach rezerwacji:
 *
 *  1. Darmowa rezerwacja przez starszy format żądania — płaskie `resources`
 *     z `totalPrice: 0` dawały `paymentStatus: "not_required"`, bo kwota
 *     pochodziła wprost z ciała żądania.
 *  2. Kolizja terminu zwracana jako HTTP 500 zamiast 409, bo komunikat
 *     z hooka kolekcji nie pasował do warunku w `catch`.
 *
 * Uwaga o zakresie dowodu dla punktu 2: żądania współbieżne NIE docierają do
 * hooka — advisory lock je szereguje, więc drugie dostaje 409 z wcześniejszej
 * kontroli w trasie. Sprawdzono: testy współbieżności przechodzą także bez
 * poprawki, więc jej nie dowodzą. Dowodzą natomiast braku podwójnej
 * rezerwacji, i po to tu są.
 *
 * Samej poprawki — rozpoznania komunikatu hooka jako konfliktu — NIE da się
 * tu dowieść end-to-end. Sprawdzono dwie drogi:
 *
 *   • żądania współbieżne → szeregowane przez advisory lock, konflikt wyłapuje
 *     kontrola w trasie, hook nie jest osiągany;
 *   • zapis wprost przez `payload.create` z kolidującym terminem → hook go
 *     NIE odrzucił, więc nie ma skąd wziąć wyjątku.
 *
 * Dowód leży zatem w `tests/unit/reservationSafety.spec.ts`: detektor jest
 * sprawdzany na komunikatach skopiowanych dosłownie z
 * `src/collections/Reservations.ts`. Że ta ścieżka jest realna, wiadomo
 * z przebiegu na żywym serwerze, gdzie trasa zalogowała
 * „nieoczekiwany błąd: Wystąpiła kolizja z inną rezerwacją w tym terminie."
 * i zwróciła 500.
 */

assertIsolatedTestDatabase()

let payload: Awaited<ReturnType<typeof getPayload>>

/** Piątek w przyszłości — piątki są otwarte do północy. */
function upcomingFriday(offsetWeeks = 3): string {
  const d = new Date()
  d.setDate(d.getDate() + 7 * offsetWeeks)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

const DATE = upcomingFriday()

const CUSTOMER = {
  firstName: "Jan",
  lastName: "Testowy",
  phone: "500100200",
  email: "klient.fikcyjny@example.invalid",
  acceptRules: true,
  acceptPrivacyPolicy: true,
  wantInvoice: false,
}

type Kind = "kregle" | "bilard"

function req(kind: Kind, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/reservations/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: kind, date: DATE, ...CUSTOMER, ...body }),
  })
}

/** Starszy format: płaskie `resources`, BEZ `segments`. */
function legacyBody(resource: number, hour: number, totalPrice: number) {
  return { startHour: hour, endHour: hour, resources: [resource], totalPrice }
}

/** Format wysyłany przez frontend. */
function segmentsBody(resource: number, hour: number, totalPrice = 0) {
  return {
    startHour: hour,
    endHour: hour,
    resources: [resource],
    segments: [{ resource, startHour: hour, endHour: hour }],
    totalPrice,
  }
}

const post = (kind: Kind, body: Record<string, unknown>) =>
  (kind === "kregle" ? kreglePOST : bilardPOST)(req(kind, body) as never)

async function setPrice(kind: Kind, pricePerHour: number) {
  const group = kind === "kregle" ? "bowling" : "billiard"
  await payload.updateGlobal({
    slug: "reservation-settings",
    overrideAccess: true,
    data: {
      [group]: {
        enabled: true,
        pricePerHour,
        reservationStartAfterOpeningMinutes: 0,
        latestReservationStartBeforeClosingMinutes: 0,
      },
    } as any,
  })
}

async function countReservations(kind: Kind, hour: number) {
  const res = await payload.find({
    collection: "reservations",
    overrideAccess: true,
    limit: 100,
    where: {
      and: [{ type: { equals: kind } }, { startHour: { equals: String(hour) } }],
    },
  })
  return res.totalDocs
}

beforeAll(async () => {
  process.env.P24_ENV = "mock"
  process.env.EMAIL_MODE = "mock"

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

  for (const [type, numbers] of [
    ["lane", [1, 2, 3]],
    ["billiard", [1, 2]],
  ] as const) {
    for (const n of numbers) {
      const existing = await payload.find({
        collection: "resources",
        overrideAccess: true,
        where: { and: [{ type: { equals: type } }, { number: { equals: n } }] },
        limit: 1,
      })
      if (existing.docs.length === 0) {
        await payload.create({
          collection: "resources",
          overrideAccess: true,
          data: { type, number: n, label: `${type} ${n}`, active: true } as any,
        })
      }
    }
  }
}, 180_000)

afterAll(async () => {
  const pool = (payload?.db as any)?.pool
  if (pool?.end) await Promise.race([pool.end(), new Promise((r) => setTimeout(r, 2000))])
})

// ─── Luka 1: darmowa rezerwacja starszym formatem ───────────────────────────

describe("starszy format żądania nie daje darmowej rezerwacji", () => {
  for (const kind of ["kregle", "bilard"] as const) {
    it(`${kind}: totalPrice 0 przy płatnej usłudze jest odrzucane`, async () => {
      await setPrice(kind, 100)
      const hour = kind === "kregle" ? 11 : 12

      const res = await post(kind, legacyBody(1, hour, 0))
      const body = await res.json()

      expect(res.status).toBe(400)
      expect(body.error).toBe("LEGACY_PAYLOAD_UNSUPPORTED")
      expect(await countReservations(kind, hour), "nie może powstać żadna rezerwacja").toBe(0)
    })

    it(`${kind}: zaniżona cena też nie przechodzi`, async () => {
      await setPrice(kind, 100)
      const hour = kind === "kregle" ? 13 : 14

      const res = await post(kind, legacyBody(1, hour, 1))
      expect(res.status).toBe(400)
      expect(await countReservations(kind, hour)).toBe(0)
    })

    it(`${kind}: format z segments wycenia serwer, mimo totalPrice 0`, async () => {
      await setPrice(kind, 100)
      const hour = kind === "kregle" ? 15 : 16

      const res = await post(kind, segmentsBody(2, hour, 0))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.redirectUrl, "płatna usługa musi kierować do płatności").toBeTruthy()

      const docs = await payload.find({
        collection: "reservations",
        overrideAccess: true,
        where: { and: [{ type: { equals: kind } }, { startHour: { equals: String(hour) } }] },
        limit: 5,
      })
      const doc = docs.docs[0] as any
      expect(doc.paymentStatus, "nie wolno oznaczyć jako not_required").toBe("pending")
      expect(Number(doc.depositAmount), "kwota policzona z cennika serwera").toBe(100)
    })

    it(`${kind}: starszy format nadal działa, gdy usługa jest bezpłatna`, async () => {
      await setPrice(kind, 0)
      const hour = kind === "kregle" ? 17 : 18

      const res = await post(kind, legacyBody(3 % 3 === 0 ? 1 : 1, hour, 0))
      expect(res.status).toBe(200)
      expect(await countReservations(kind, hour)).toBe(1)
    })
  }
})

// ─── Luka 2: kolizja to 409, nie 500 ────────────────────────────────────────

describe("kolizja terminu zwraca 409", () => {
  it("drugie żądanie na ten sam slot dostaje 409", async () => {
    await setPrice("kregle", 0)

    const first = await post("kregle", segmentsBody(1, 19))
    expect(first.status).toBe(200)

    const second = await post("kregle", segmentsBody(1, 19))
    expect(second.status).toBe(409)
    const body = await second.json()
    expect(body.error).toBe("NO_AVAILABILITY")
  })

  it("żądania WSPÓŁBIEŻNE: jedno przechodzi, drugie dostaje 409 — nigdy 500", async () => {
    await setPrice("kregle", 0)
    const hour = 20

    // Oba startują razem, więc oba przechodzą wcześniejszą kontrolę
    // dostępności i konflikt wyłapuje dopiero hook kolekcji.
    const results = await Promise.all([
      post("kregle", segmentsBody(2, hour)),
      post("kregle", segmentsBody(2, hour)),
    ])
    const statuses = results.map((r) => r.status).sort()

    expect(statuses, `otrzymano ${statuses.join("/")}`).toEqual([200, 409])
    expect(statuses).not.toContain(500)
    expect(await countReservations("kregle", hour), "brak podwójnej rezerwacji").toBe(1)
  })

  it("bilard: żądania współbieżne również kończą się 409, nie 500", async () => {
    await setPrice("bilard", 0)
    const hour = 21

    const results = await Promise.all([
      post("bilard", segmentsBody(2, hour)),
      post("bilard", segmentsBody(2, hour)),
    ])
    const statuses = results.map((r) => r.status).sort()

    expect(statuses, `otrzymano ${statuses.join("/")}`).toEqual([200, 409])
    expect(await countReservations("bilard", hour)).toBe(1)
  })

  it("trzy równoległe żądania: dokładnie jedna rezerwacja", async () => {
    await setPrice("kregle", 0)
    const hour = 22

    const results = await Promise.all([
      post("kregle", segmentsBody(3, hour)),
      post("kregle", segmentsBody(3, hour)),
      post("kregle", segmentsBody(3, hour)),
    ])
    const statuses = results.map((r) => r.status)

    expect(statuses.filter((s) => s === 200)).toHaveLength(1)
    expect(statuses.filter((s) => s === 500), "żadne nie może być awarią").toHaveLength(0)
    expect(await countReservations("kregle", hour)).toBe(1)
  })
})
