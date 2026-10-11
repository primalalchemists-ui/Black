// @vitest-environment node
/**
 * Testy integracyjne: rezerwacje i blackouty kończące się o północy.
 *
 * Wywołują PRAWDZIWE handlery HTTP (`GET`/`POST` z route.ts) na PRAWDZIWYM
 * PostgreSQL, przez PRAWDZIWY Payload. Nie odtwarzają algorytmu produkcyjnego
 * w helperach testowych — helpery tylko budują żądania i czytają odpowiedzi.
 *
 * Baza: wyłącznie izolowany kontener testowy (patrz tests/int/README-integration.md).
 * Uruchomienie bez PAYLOAD_DB_PUSH=true oraz DATABASE_URL wskazującego bazę
 * testową kończy się jawnym błędem — nigdy nie dotykamy bazy dev ani produkcji.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getPayload } from "payload"
import config from "@payload-config"

import { GET as kregleGET, POST as kreglePOST } from "@/app/(payload)/api/reservations/kregle/route"
import { GET as bilardGET, POST as bilardPOST } from "@/app/(payload)/api/reservations/bilard/route"
import { assertIsolatedTestDatabase } from "../helpers/isolatedTestDatabase"

// ─── Bezpiecznik: nigdy nie uruchamiaj na bazie innej niż testowa ────────────

// Strukturalna walidacja celu połączenia — nazwa bazy, lokalny host,
// brak parametrów mogących przestawić cel, wymagany opt-in na push.
// Wykonuje się przed `getPayload`, czyli przed jakimkolwiek połączeniem,
// zmianą schematu i utworzeniem danych testowych.
assertIsolatedTestDatabase()

let payload: Awaited<ReturnType<typeof getPayload>>

// ─── Pomocniki HTTP (tylko transport, zero logiki domenowej) ────────────────

type Slot = { time: string; statuses: Record<string, "free" | "busy" | "blocked"> }
type AvailabilityBody = {
  ok: boolean
  enabled?: boolean
  resources?: { id: string; number: number }[]
  slots?: Slot[]
  error?: string
}

async function availability(
  kind: "kregle" | "bilard",
  date: string,
): Promise<AvailabilityBody> {
  const handler = kind === "kregle" ? kregleGET : bilardGET
  const res = await handler(new Request(`http://localhost/api/reservations/${kind}?date=${date}`))
  return (await res.json()) as AvailabilityBody
}

async function create(
  kind: "kregle" | "bilard",
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const handler = kind === "kregle" ? kreglePOST : bilardPOST
  const res = await handler(
    new Request(`http://localhost/api/reservations/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}

/** Żądanie rezerwacji. `endHour` = OSTATNIA zajęta godzina (inclusive). */
function bookingBody(
  kind: "kregle" | "bilard",
  date: string,
  resourceNumber: number,
  startHour: number,
  endHour: number,
) {
  return {
    type: kind,
    date,
    startHour,
    endHour,
    resources: [resourceNumber],
    totalPrice: 0,
    segments: [{ resource: resourceNumber, startHour, endHour }],
    firstName: "Jan",
    lastName: "Testowy",
    phone: "123456789",
    email: "jan.testowy@example.com",
    notes: "",
    wantInvoice: false,
    acceptRules: true,
    acceptPrivacyPolicy: true,
  }
}

/** `day` jest kolumna timestamptz — filtrujemy zakresem, nie operatorem `like`. */
function dayRange(d: string) {
  return [
    { day: { greater_than_equal: `${d}T00:00:00.000Z` } },
    { day: { less_than_equal: `${d}T23:59:59.999Z` } },
  ]
}

function statusAt(body: AvailabilityBody, resourceNumber: number, time: string) {
  const resource = body.resources?.find((r) => Number(r.number) === resourceNumber)
  if (!resource) throw new Error(`Brak zasobu numer ${resourceNumber} w odpowiedzi`)
  const slot = body.slots?.find((s) => s.time === time)
  if (!slot) throw new Error(`Brak slotu ${time}. Dostępne: ${body.slots?.map((s) => s.time).join(",")}`)
  return slot.statuses[String(resource.id)]
}

/** Dni testowe daleko w przyszłości — lead-time 15 min nie przeszkadza. */
const BASE = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
function day(offset: number): string {
  const d = new Date(BASE.getTime() + offset * 24 * 60 * 60 * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

beforeAll(async () => {
  payload = await getPayload({ config })

  // Godziny otwarcia 10:00–00:00 (zamknięcie o północy) — bez tego fallback
  // 16:00–22:00 nie wygenerowałby slotu 23:00.
  await payload.updateGlobal({
    slug: "site-settings",
    overrideAccess: true,
    data: {
      name: "Black Test",
      openingHours: WEEKDAYS.map((key) => ({ key, open: "10:00", close: "00:00" })),
    } as any,
  })

  // pricePerHour = 0 → brak płatności P24 w tych testach; sprawdzamy wyłącznie
  // logikę dostępności i kolizji. Płatności mają własne pokrycie.
  await payload.updateGlobal({
    slug: "reservation-settings",
    overrideAccess: true,
    data: {
      bowling: {
        enabled: true,
        pricePerHour: 0,
        reservationStartAfterOpeningMinutes: 0,
        latestReservationStartBeforeClosingMinutes: 0,
      },
      billiard: {
        enabled: true,
        pricePerHour: 0,
        reservationStartAfterOpeningMinutes: 0,
        latestReservationStartBeforeClosingMinutes: 0,
      },
    } as any,
  })

  // Zasoby: tory 1–3 (kręgle), stoły 1–2 (bilard).
  // Idempotentnie — suite da się uruchomić wielokrotnie na tej samej bazie.
  async function ensureResource(type: "lane" | "billiard", number: number, label: string) {
    const existing = await payload.find({
      collection: "resources",
      overrideAccess: true,
      where: { and: [{ type: { equals: type } }, { number: { equals: number } }] },
      limit: 1,
    })
    if (existing.docs.length > 0) return
    await payload.create({
      collection: "resources",
      overrideAccess: true,
      data: { type, number, label, active: true } as any,
    })
  }

  for (const n of [1, 2, 3]) await ensureResource("lane", n, `Tor ${n}`)
  for (const n of [1, 2]) await ensureResource("billiard", n, `Stol ${n}`)
}, 180_000)

afterAll(async () => {
  // Nie blokujemy teardownu na zamykaniu puli — po nieudanym beforeAll
  // potrafi zawisnac. Vitest i tak konczy proces.
  const pool = (payload?.db as any)?.pool
  if (!pool?.end) return
  await Promise.race([
    pool.end().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ])
}, 30_000)

// ─── 1–6. Kręgle: 23:00–00:00 ───────────────────────────────────────────────

describe("kręgle 23:00–00:00", () => {
  const D = day(0)

  it("tworzy rezerwację (HTTP 200)", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 1, 23, 23))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
  })

  it("zapisuje poprawne timestampy i segment z endHour = 0", async () => {
    const found = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { and: [{ type: { equals: "kregle" } }, ...dayRange(D)] },
      limit: 10,
      depth: 0,
    })
    const doc = (found.docs as any[]).find((d) => String(d.startHour) === "23")
    expect(doc, "rezerwacja powinna istnieć w bazie").toBeTruthy()

    // endsAt musi być NASTĘPNEGO dnia o północy
    const endsAt = new Date(doc.endsAt)
    const startsAt = new Date(doc.startsAt)
    expect(endsAt.getTime()).toBeGreaterThan(startsAt.getTime())
    expect(endsAt.getUTCHours()).toBe(0)
    expect(endsAt.getUTCDate()).not.toBe(startsAt.getUTCDate())

    // segment gubi dzień — to jest właśnie przyczyna buga
    const seg = (doc.segments as any[])[0]
    expect(Number(seg.startHour)).toBe(23)
    expect(Number(seg.endHour)).toBe(0)
  })

  it("tor 1 jest ZAJĘTY o 23:00", async () => {
    const body = await availability("kregle", D)
    expect(body.ok).toBe(true)
    expect(statusAt(body, 1, "23:00")).toBe("busy")
  })

  it("tor 2 pozostaje wolny o 23:00", async () => {
    const body = await availability("kregle", D)
    expect(statusAt(body, 2, "23:00")).toBe("free")
  })

  it("duplikat na tym samym torze zostaje odrzucony (HTTP 409)", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 1, 23, 23))
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("NO_AVAILABILITY")
  })

  it("ten sam czas na innym torze jest dozwolony", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 2, 23, 23))
    expect(res.status).toBe(200)
  })
})

// ─── 7. Kręgle: 22:00–00:00 ─────────────────────────────────────────────────

describe("kręgle 22:00–00:00", () => {
  const D = day(1)

  it("tworzy rezerwację", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 1, 22, 23))
    expect(res.status).toBe(200)
  })

  it("blokuje OBA sloty: 22:00 i 23:00", async () => {
    const body = await availability("kregle", D)
    expect(statusAt(body, 1, "22:00")).toBe("busy")
    expect(statusAt(body, 1, "23:00")).toBe("busy")
  })

  it("nie blokuje 21:00", async () => {
    const body = await availability("kregle", D)
    expect(statusAt(body, 1, "21:00")).toBe("free")
  })

  it("odrzuca nakładającą się rezerwację 23:00", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 1, 23, 23))
    expect(res.status).toBe(409)
  })

  it("dopuszcza nienakładającą się 20:00–21:00", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 1, 20, 20))
    expect(res.status).toBe(200)
  })
})

// ─── Regresja: zwykła rezerwacja 18:00–20:00 ────────────────────────────────

describe("regresja: kręgle 18:00–20:00", () => {
  const D = day(2)

  it("tworzy i blokuje tylko 18:00 i 19:00", async () => {
    expect((await create("kregle", bookingBody("kregle", D, 1, 18, 19))).status).toBe(200)
    const body = await availability("kregle", D)
    expect(statusAt(body, 1, "18:00")).toBe("busy")
    expect(statusAt(body, 1, "19:00")).toBe("busy")
    expect(statusAt(body, 1, "17:00")).toBe("free")
    expect(statusAt(body, 1, "20:00")).toBe("free")
  })

  it("rezerwacja sąsiadująca 20:00–21:00 przechodzi", async () => {
    expect((await create("kregle", bookingBody("kregle", D, 1, 20, 20))).status).toBe(200)
  })
})

// ─── 9. Bilard ──────────────────────────────────────────────────────────────

describe("bilard 23:00–00:00", () => {
  const D = day(3)

  it("tworzy rezerwację i blokuje stół 1 o 23:00", async () => {
    expect((await create("bilard", bookingBody("bilard", D, 1, 23, 23))).status).toBe(200)
    const body = await availability("bilard", D)
    expect(statusAt(body, 1, "23:00")).toBe("busy")
  })

  it("odrzuca duplikat (409) i nie blokuje stołu 2", async () => {
    expect((await create("bilard", bookingBody("bilard", D, 1, 23, 23))).status).toBe(409)
    const body = await availability("bilard", D)
    expect(statusAt(body, 2, "23:00")).toBe("free")
  })
})

// ─── Rezerwacja wielozasobowa z różnymi godzinami ───────────────────────────

describe("wiele torów z różnymi segmentami", () => {
  const D = day(4)

  it("każdy tor blokowany tylko w swoim przedziale", async () => {
    const res = await create("kregle", {
      ...bookingBody("kregle", D, 1, 18, 23),
      resources: [1, 2],
      segments: [
        { resource: 1, startHour: 22, endHour: 23 }, // 22:00–00:00
        { resource: 2, startHour: 18, endHour: 19 }, // 18:00–20:00
      ],
    })
    expect(res.status).toBe(200)

    const body = await availability("kregle", D)
    expect(statusAt(body, 1, "22:00")).toBe("busy")
    expect(statusAt(body, 1, "23:00")).toBe("busy")
    expect(statusAt(body, 1, "18:00")).toBe("free")
    expect(statusAt(body, 2, "18:00")).toBe("busy")
    expect(statusAt(body, 2, "19:00")).toBe("busy")
    expect(statusAt(body, 2, "23:00")).toBe("free")
    expect(statusAt(body, 3, "23:00")).toBe("free")
  })
})

// ─── 10. Blackout 22:00–00:00 ───────────────────────────────────────────────

describe("blackout 22:00–00:00", () => {
  const D = day(5)
  let laneId: number | string = 0

  it("blackout kończący się o północy DA SIĘ utworzyć", async () => {
    const lanes = await payload.find({
      collection: "resources",
      overrideAccess: true,
      where: { and: [{ type: { equals: "lane" } }, { number: { equals: 1 } }] },
      limit: 1,
    })
    laneId = (lanes.docs[0] as any).id

    const created = await payload.create({
      collection: "blackouts",
      overrideAccess: true,
      data: {
        title: "Test polnoc",
        service: "bowling",
        day: `${D}T00:00:00.000Z`,
        allDay: false,
        startHour: "22",
        startMinute: "0",
        endHour: "0",
        endMinute: "0",
        active: true,
        resources: [laneId],
      } as any,
    })
    expect(created.id).toBeTruthy()
  })

  it("blokuje OBA sloty: 22:00 i 23:00", async () => {
    const body = await availability("kregle", D)
    expect(statusAt(body, 1, "22:00")).toBe("blocked")
    expect(statusAt(body, 1, "23:00")).toBe("blocked")
  })

  it("nie blokuje 21:00 ani innego toru", async () => {
    const body = await availability("kregle", D)
    expect(statusAt(body, 1, "21:00")).toBe("free")
    expect(statusAt(body, 2, "23:00")).toBe("free")
  })

  it("POST rezerwacji na zablokowany slot zostaje odrzucony", async () => {
    const res = await create("kregle", bookingBody("kregle", D, 1, 23, 23))
    expect(res.status).toBe(409)
  })

  it("odrzuca blackout zerowej długości", async () => {
    await expect(
      payload.create({
        collection: "blackouts",
        overrideAccess: true,
        data: {
          title: "Zero",
          service: "bowling",
          day: `${day(6)}T00:00:00.000Z`,
          allDay: false,
          startHour: "20",
          startMinute: "0",
          endHour: "20",
          endMinute: "0",
          active: true,
          resources: [laneId],
        } as any,
      }),
    ).rejects.toThrow()
  })

  it("odrzuca blackout przechodzący na następny dzień (22:00–02:00)", async () => {
    await expect(
      payload.create({
        collection: "blackouts",
        overrideAccess: true,
        data: {
          title: "Przez polnoc",
          service: "bowling",
          day: `${day(7)}T00:00:00.000Z`,
          allDay: false,
          startHour: "22",
          startMinute: "0",
          endHour: "2",
          endMinute: "0",
          active: true,
          resources: [laneId],
        } as any,
      }),
    ).rejects.toThrow()
  })

  it("blackout całodniowy nadal blokuje cały dzień", async () => {
    const D2 = day(8)
    await payload.create({
      collection: "blackouts",
      overrideAccess: true,
      data: {
        title: "Caly dzien",
        service: "bowling",
        day: `${D2}T00:00:00.000Z`,
        allDay: true,
        active: true,
        resources: [laneId],
      } as any,
    })
    const body = await availability("kregle", D2)
    expect(statusAt(body, 1, "12:00")).toBe("blocked")
    expect(statusAt(body, 1, "23:00")).toBe("blocked")
    expect(statusAt(body, 2, "23:00")).toBe("free")
  })

  it("zwykły blackout dzienny 14:00–16:00 działa bez zmian", async () => {
    const D3 = day(9)
    await payload.create({
      collection: "blackouts",
      overrideAccess: true,
      data: {
        title: "Dzienny",
        service: "bowling",
        day: `${D3}T00:00:00.000Z`,
        allDay: false,
        startHour: "14",
        startMinute: "0",
        endHour: "16",
        endMinute: "0",
        active: true,
        resources: [laneId],
      } as any,
    })
    const body = await availability("kregle", D3)
    expect(statusAt(body, 1, "14:00")).toBe("blocked")
    expect(statusAt(body, 1, "15:00")).toBe("blocked")
    expect(statusAt(body, 1, "16:00")).toBe("free")
    expect(statusAt(body, 1, "23:00")).toBe("free")
  })
})

// ─── 11. Rezerwacja z panelu administratora ─────────────────────────────────

describe("panel administratora", () => {
  const D = day(10)

  it("admin tworzy rezerwację 23:00–00:00, a kolidująca zostaje odrzucona", async () => {
    const lanes = await payload.find({
      collection: "resources",
      overrideAccess: true,
      where: { and: [{ type: { equals: "lane" } }, { number: { equals: 3 } }] },
      limit: 1,
    })
    const laneId = (lanes.docs[0] as any).id

    const base = {
      type: "kregle",
      day: `${D}T00:00:00.000Z`,
      customer: { firstName: "Admin", lastName: "Test", phone: "123456789" },
      startHour: "23",
      startMinute: "0",
      endHour: "0",
      endMinute: "0",
      resources: [laneId],
      acceptRules: true,
      source: "staff",
      status: "new",
    }

    const created = await payload.create({
      collection: "reservations",
      overrideAccess: true,
      req: { user: { role: "admin" } } as any,
      data: base as any,
    })
    expect(created.id).toBeTruthy()

    // endsAt następnego dnia o północy
    const endsAt = new Date((created as any).endsAt)
    expect(endsAt.getUTCHours()).toBe(0)

    // kolidująca rezerwacja na tym samym torze musi zostać odrzucona
    await expect(
      payload.create({
        collection: "reservations",
        overrideAccess: true,
        req: { user: { role: "admin" } } as any,
        data: base as any,
      }),
    ).rejects.toThrow()
  })

  it("odrzuca rezerwację zerowej długości (18:00–18:00)", async () => {
    const lanes = await payload.find({
      collection: "resources",
      overrideAccess: true,
      where: { and: [{ type: { equals: "lane" } }, { number: { equals: 3 } }] },
      limit: 1,
    })
    const laneId = (lanes.docs[0] as any).id

    await expect(
      payload.create({
        collection: "reservations",
        overrideAccess: true,
        req: { user: { role: "admin" } } as any,
        data: {
          type: "kregle",
          day: `${day(11)}T00:00:00.000Z`,
          customer: { firstName: "Admin", lastName: "Zero", phone: "123456789" },
          startHour: "18",
          startMinute: "0",
          endHour: "18",
          endMinute: "0",
          resources: [laneId],
          acceptRules: true,
          source: "staff",
          status: "new",
        } as any,
      }),
    ).rejects.toThrow()
  })
})

// ─── 12. Anulowanie i wygaśnięcie płatności zwalniają dostępność ────────────

describe("anulowanie i wygaśnięcie płatności zwalniają slot", () => {
  it("anulowanie zwalnia slot 23:00", async () => {
    const D = day(12)
    expect((await create("kregle", bookingBody("kregle", D, 1, 23, 23))).status).toBe(200)
    expect(statusAt(await availability("kregle", D), 1, "23:00")).toBe("busy")

    const found = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { and: [{ type: { equals: "kregle" } }, ...dayRange(D)] },
      limit: 5,
      depth: 0,
    })
    for (const doc of found.docs as any[]) {
      await payload.update({
        collection: "reservations",
        id: doc.id,
        overrideAccess: true,
        context: { skipConflictCheck: true } as any,
        data: { status: "cancelled" } as any,
      })
    }

    expect(statusAt(await availability("kregle", D), 1, "23:00")).toBe("free")
    expect((await create("kregle", bookingBody("kregle", D, 1, 23, 23))).status).toBe(200)
  })

  it("wygasły hold (pending + expiresAt w przeszłości) nie blokuje slotu", async () => {
    const D = day(13)
    expect((await create("kregle", bookingBody("kregle", D, 1, 23, 23))).status).toBe(200)

    const found = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { and: [{ type: { equals: "kregle" } }, ...dayRange(D)] },
      limit: 5,
      depth: 0,
    })
    const doc = (found.docs as any[])[0]

    // Symulacja porzuconej płatności: pending z holdem w przeszłości.
    await payload.update({
      collection: "reservations",
      id: doc.id,
      overrideAccess: true,
      context: { skipConflictCheck: true } as any,
      data: {
        paymentStatus: "pending",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      } as any,
    })

    expect(statusAt(await availability("kregle", D), 1, "23:00")).toBe("free")
    expect((await create("kregle", bookingBody("kregle", D, 1, 23, 23))).status).toBe(200)
  })

  it("aktywny hold (pending + expiresAt w przyszłości) NADAL blokuje slot", async () => {
    const D = day(14)
    expect((await create("kregle", bookingBody("kregle", D, 1, 23, 23))).status).toBe(200)

    const found = await payload.find({
      collection: "reservations",
      overrideAccess: true,
      where: { and: [{ type: { equals: "kregle" } }, ...dayRange(D)] },
      limit: 5,
      depth: 0,
    })
    await payload.update({
      collection: "reservations",
      id: (found.docs as any[])[0].id,
      overrideAccess: true,
      context: { skipConflictCheck: true } as any,
      data: {
        paymentStatus: "pending",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      } as any,
    })

    expect(statusAt(await availability("kregle", D), 1, "23:00")).toBe("busy")
    expect((await create("kregle", bookingBody("kregle", D, 1, 23, 23))).status).toBe(409)
  })
})
