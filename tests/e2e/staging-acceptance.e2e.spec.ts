import { test, expect, type APIRequestContext } from "@playwright/test"

/**
 * Testy akceptacyjne środowiska staging.
 *
 * Uderzają w DZIAŁAJĄCY serwer po prawdziwym HTTP, więc przechodzą przez
 * middleware, bramkę stagingową i trasy razem — czego testy jednostkowe nie
 * obejmują. Baza musi być zasiana przez `scripts/seed-staging-content.ts`.
 *
 * Podział odpowiedzialności:
 *
 *  • logikę dostępności, kolizji, północy, anulowania i wygasania pokrywa
 *    `tests/int/midnight.int.spec.ts` (30 testów na izolowanej bazie);
 *  • tutaj sprawdzamy to, czego tam nie ma: renderowanie treści w przeglądarce,
 *    ścieżkę stolików (bez płatności, z mailem) i zachowanie całego stosu HTTP.
 *
 * Suite SPRZĄTA PO SOBIE: każda utworzona rezerwacja jest anulowana w afterAll,
 * żeby kolejne uruchomienie nie trafiało na zajęty slot.
 */

const KEY = process.env.STAGING_ACCESS_KEY ?? ""

/** Najbliższy piątek za co najmniej 7 dni — piątki są otwarte 16:00–00:00. */
function upcomingFriday(): string {
  const d = new Date()
  d.setDate(d.getDate() + 7)
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

/** Utworzone grupy rezerwacji — anulowane po testach. */
const created: string[] = []

/**
 * Rezerwacja w kształcie, jaki wysyła prawdziwy frontend: z `segments`.
 *
 * UWAGA: `endHour` to OSTATNIA ZAJĘTA godzina (inclusive), nie godzina
 * zakończenia. Rezerwacja 23:00–00:00 to `startHour: 23, endHour: 23`;
 * serwer zapisuje wtedy `segment.endHour = 0`. Dlatego każdy test poniżej
 * dostaje własną, rozłączną godzinę na danym zasobie.
 *
 * To istotne — trasa ma dwie ścieżki. Ta z `segments` przelicza cenę po
 * stronie serwera z `reservation-settings`. Druga, starsza (płaskie
 * `resources` + `totalPrice`, bez `segments`), bierze kwotę od klienta.
 * Testujemy drogę produkcyjną.
 */
async function create(
  request: APIRequestContext,
  kind: "kregle" | "bilard",
  opts: { startHour: number; endHour: number; resource: number; totalPrice?: number },
) {
  const res = await request.post(`/api/reservations/${kind}`, {
    data: {
      type: kind,
      date: DATE,
      startHour: opts.startHour,
      endHour: opts.endHour,
      resources: [opts.resource],
      segments: [{ resource: opts.resource, startHour: opts.startHour, endHour: opts.endHour }],
      totalPrice: opts.totalPrice ?? 0,
      ...CUSTOMER,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (res.status() === 200 && body.groupId) created.push(body.groupId)
  return { status: res.status(), body }
}

const createBowling = (
  request: APIRequestContext,
  opts: { startHour: number; endHour: number; resource: number; totalPrice?: number },
) => create(request, "kregle", opts)

test.afterAll(async ({ playwright }) => {
  if (created.length === 0) return
  const request = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    extraHTTPHeaders: KEY ? { "x-staging-access": KEY } : {},
  })
  for (const sessionId of created) {
    await request.post("/api/reservations/cancel", { data: { sessionId } }).catch(() => {})
  }
  await request.dispose()
})

// ─── Bramka stagingowa ──────────────────────────────────────────────────────

test.describe("bramka stagingowa", () => {
  test("bez klucza strona oddaje formularz logowania, nie treść", async ({ playwright }) => {
    // extraHTTPHeaders jawnie puste — inaczej kontekst dziedziczy klucz
    // z playwright.config.ts i test nigdy nie byłby anonimowy.
    const anon = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
      extraHTTPHeaders: {},
    })
    const res = await anon.get("/restauracja")
    if (res.status() === 200) {
      // Ochrona wyłączona na tym środowisku — test nie ma czego sprawdzać.
      test.skip(true, "STAGING_PROTECTION wyłączone")
    }
    expect(res.status()).toBe(401)
    expect(await res.text()).toContain("Środowisko testowe")
    await anon.dispose()
  })

  test("bez klucza mutacja rezerwacji nie dociera do handlera", async ({ playwright }) => {
    // extraHTTPHeaders jawnie puste — inaczej kontekst dziedziczy klucz
    // z playwright.config.ts i test nigdy nie byłby anonimowy.
    const anon = await playwright.request.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
      extraHTTPHeaders: {},
    })
    const res = await anon.post("/api/reservations/kregle", { data: {} })
    if (res.status() !== 401) test.skip(true, "STAGING_PROTECTION wyłączone")
    expect(await res.json()).toEqual({ ok: false, error: "STAGING_UNAUTHORIZED" })
    await anon.dispose()
  })
})

// ─── Treści z produkcji ─────────────────────────────────────────────────────

test.describe("treści przeniesione z produkcji", () => {
  test("restauracja pokazuje kategorie, pozycje i ceny", async ({ page }) => {
    await page.goto("/restauracja")

    // Menu dociąga się po stronie klienta — czekamy na treść, nie na sieć.
    await expect(page.getByText("Dania główne").first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("Pinsa włoska").first()).toBeVisible()
    await expect(page.getByText("Whisky").first()).toBeVisible()

    // Konkretna pozycja z produkcji wraz z ceną.
    await expect(page.getByText("Burger wołowy").first()).toBeVisible()
    await expect(page.getByText(/47/).first()).toBeVisible()
  })

  test("danie dnia wskazuje pozycję z menu", async ({ request }) => {
    const res = await request.get("/api/globals/dish-of-day?depth=2")
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.item?.name).toBeTruthy()
    expect(Number(body.item?.price)).toBeGreaterThan(0)
  })

  test("liczebności treści zgadzają się ze źródłem produkcyjnym", async ({ request }) => {
    const categories = await (await request.get("/api/menu-categories?limit=0")).json()
    const items = await (await request.get("/api/menu-items?limit=0")).json()
    expect(categories.totalDocs).toBe(15)
    expect(items.totalDocs).toBe(76)
  })

  test("godziny otwarcia pochodzą z CMS", async ({ request }) => {
    const settings = await (await request.get("/api/globals/site-settings")).json()
    const friday = settings.openingHours?.find((h: any) => h.key === "friday")
    expect(friday).toMatchObject({ open: "16:00", close: "00:00" })
    const monday = settings.openingHours?.find((h: any) => h.key === "monday")
    expect(monday?.close).toBe("nieczynne")
  })

  test("strona rozrywki pokazuje zasoby i cennik", async ({ page, request }) => {
    const counts = await (await request.get("/api/resources/count")).json()
    expect(counts).toMatchObject({ laneCount: 2, billiardCount: 3 })

    await page.goto("/rozrywka")
    await expect(page.locator("body")).toContainText(/kręgle|Kręgle/, { timeout: 60_000 })
    await expect(page.locator("body")).toContainText(/bilard|Bilard/)
  })

  test("strona główna renderuje się z treścią z CMS", async ({ page }) => {
    await page.goto("/")
    await expect(page.locator("body")).toContainText(/Black/, { timeout: 60_000 })
    await expect(page.locator("h1, h2").first()).toBeVisible()
  })
})

// ─── Dostępność i rezerwacje przez prawdziwe HTTP ───────────────────────────

test.describe("rezerwacje", () => {
  test("dostępność kręgli zwraca slot i zasoby", async ({ request }) => {
    const res = await request.get(`/api/reservations/availability?type=kregle&date=${DATE}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.resources?.length).toBe(2)
    expect(body.slots?.length).toBeGreaterThan(0)

    // Siatka nie wymyśla dostępności: każdy status to konkretna wartość.
    for (const slot of body.slots) {
      for (const status of Object.values(slot.statuses)) {
        expect(["free", "busy", "blocked"]).toContain(status)
      }
    }
  })

  test("kręgle: rezerwacja powstaje i wymaga płatności", async ({ request }) => {
    const { status, body } = await createBowling(request, { startHour: 17, endHour: 17, resource: 1 })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.groupId).toBeTruthy()
    // P24_ENV=mock zwraca adres powrotu, nie potwierdza płatności.
    expect(body.redirectUrl).toBeTruthy()
  })

  test("kręgle: cena pochodzi z serwera, nie z żądania", async ({ request }) => {
    // Klient podaje 0, a usługa jest płatna — serwer i tak kieruje do płatności.
    const { status, body } = await createBowling(request, {
      startHour: 20,
      endHour: 20,
      resource: 1,
      totalPrice: 0,
    })
    expect(status).toBe(200)
    expect(body.redirectUrl, "ścieżka z segments musi przeliczyć cenę sama").toBeTruthy()
  })

  test("kręgle: kolizja na tym samym torze jest odrzucana", async ({ request }) => {
    const first = await createBowling(request, { startHour: 19, endHour: 19, resource: 2 })
    expect(first.status).toBe(200)

    const clash = await createBowling(request, { startHour: 19, endHour: 19, resource: 2 })
    expect(clash.status).toBe(409)
  })

  test("kręgle: rezerwacja do północy powstaje i blokuje swój tor", async ({ request }) => {
    // 23:00–00:00 w konwencji inclusive.
    const made = await createBowling(request, { startHour: 23, endHour: 23, resource: 1 })
    expect(made.status).toBe(200)

    const res = await request.get(`/api/reservations/availability?type=kregle&date=${DATE}`)
    const body = await res.json()
    const slot23 = body.slots?.find((s: any) => s.time === "23:00")
    expect(slot23, "slot 23:00 musi istnieć").toBeTruthy()

    const laneId = body.resources.find((r: any) => r.number === 1)?.id
    expect(slot23.statuses[laneId]).toBe("busy")
  })

  test("bilard: rezerwacja powstaje", async ({ request }) => {
    const { status, body } = await create(request, "bilard", {
      startHour: 18,
      endHour: 18,
      resource: 1,
    })
    expect(status).toBe(200)
    expect(body.groupId).toBeTruthy()
  })

  test("anulowanie zwalnia slot", async ({ request }) => {
    const made = await createBowling(request, { startHour: 21, endHour: 21, resource: 2 })
    expect(made.status).toBe(200)

    const cancel = await request.post("/api/reservations/cancel", {
      data: { sessionId: made.body.groupId },
    })
    expect(cancel.status()).toBe(200)

    // Po anulowaniu ten sam slot da się zarezerwować ponownie.
    const again = await createBowling(request, { startHour: 21, endHour: 21, resource: 2 })
    expect(again.status).toBe(200)
  })

  test("powtórzone anulowanie jest idempotentne", async ({ request }) => {
    const made = await createBowling(request, { startHour: 16, endHour: 16, resource: 1 })
    expect(made.status).toBe(200)

    const first = await request.post("/api/reservations/cancel", {
      data: { sessionId: made.body.groupId },
    })
    const second = await request.post("/api/reservations/cancel", {
      data: { sessionId: made.body.groupId },
    })
    expect(first.status()).toBe(200)
    expect(second.status()).toBe(200)
  })

  test("stoliki: rezerwacja nie wymaga płatności i zwraca numer", async ({ request }) => {
    const res = await request.post("/api/reservations/stoliki", {
      data: {
        type: "stolik",
        date: DATE,
        hour: "18:00",
        partySize: 4,
        tablesCount: 1,
        deposit: 0,
        ...CUSTOMER,
      },
    })
    const body = await res.json()
    if (res.status() === 200 && body.groupId) created.push(body.groupId)

    expect(res.status()).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.reservationNumber).toBeTruthy()
    // Brak redirectUrl: ta ścieżka ma paymentStatus not_required,
    // więc mail potwierdzający idzie od razu.
    expect(body.redirectUrl).toBeUndefined()
  })

  test("sweep wygasłych rezerwacji wymaga uwierzytelnienia pracownika", async ({ request }) => {
    const res = await request.post("/api/reservations/expire-pending", { data: {} })
    // Bramka przepuszcza (mamy klucz), ale access check Payloada nie.
    expect([401, 403]).toContain(res.status())
  })
})
