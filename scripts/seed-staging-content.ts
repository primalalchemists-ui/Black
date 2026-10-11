/**
 * Replikacja treści publicznych produkcji do bazy stagingowej.
 *
 * Skrypt czyta treść WYŁĄCZNIE z publicznego HTTP produkcji (same GET-y) i
 * zapisuje ją do bazy, której tożsamość została wcześniej potwierdzona
 * znacznikiem `db_environment_marker`. Nigdy nie łączy się z bazą produkcyjną.
 *
 * ── DLACZEGO NIE MOŻE TRAFIĆ W PRODUKCJĘ ─────────────────────────────────────
 *
 * Zapis wymaga, by w bazie docelowej ISTNIAŁA tabela `db_environment_marker`
 * z wartością równą DB_ENVIRONMENT_ID. Tę tabelę zakłada wyłącznie
 * `scripts/run-migrations.ts`, uruchamiany tylko na stagingu — baza
 * produkcyjna jej nie ma, a ten skrypt nigdy jej nie tworzy. Brak znacznika to
 * błąd krytyczny, nie sytuacja do naprawienia w locie.
 *
 * ── CZEGO NIE RUSZA ──────────────────────────────────────────────────────────
 *
 * Lista kolekcji zapisywalnych jest zamknięta (WRITABLE). Kolekcje z danymi
 * klientów i kontami (reservations, payments, users, occasional-inquiries,
 * blackouts, media) są wprost zakazane (FORBIDDEN) i sprawdzane asercją przy
 * starcie — pomyłka w edycji listy zatrzyma skrypt, zamiast wysłać zapis.
 *
 * Rezerwacji testowych ten skrypt NIE tworzy. Mają być fikcyjne i generowane
 * osobno, żeby dane testowe nigdy nie mieszały się z replikacją treści.
 *
 * ── IDEMPOTENCJA I CUDZE ZMIANY ──────────────────────────────────────────────
 *
 * Każdy zapisany dokument jest odnotowywany w tabeli `seed_provenance`
 * (poza modelem Payloada) z hashem treści. Przy kolejnym uruchomieniu:
 *
 *   • dokumentu nie ma                                   → CREATE
 *   • jest i zgadza się ze źródłem                       → NOOP
 *   • jest, treść równa ostatniemu zapisowi seeda        → UPDATE
 *   • jest, ale obcego pochodzenia lub zmieniony ręcznie → POMINIĘTY
 *
 * Ostatni przypadek to ochrona przed nadpisaniem danych nieznanego pochodzenia.
 * Wymusić nadpisanie można tylko jawnym --force, raportowanym w podsumowaniu.
 *
 * ── TRYBY ────────────────────────────────────────────────────────────────────
 *
 *   (domyślnie)  --dry-run   pokazuje plan, nie zapisuje niczego
 *                --validate  porównuje staging ze źródłem, nie zapisuje
 *                --apply     wykonuje plan (wymaga SEED_TARGET=true)
 *                --force     dopuszcza nadpisanie dokumentów obcego pochodzenia
 *
 * ── URUCHOMIENIE ─────────────────────────────────────────────────────────────
 *
 *   DATABASE_URL=...        baza stagingowa (nigdy produkcyjna)
 *   DB_ENVIRONMENT_ID=...   musi zgadzać się ze znacznikiem w tej bazie
 *   SEED_TARGET=true        tylko dla --apply
 *   SEED_SOURCE_URL=...     domyślnie https://www.kregielnia-wielun.pl
 *
 *   pnpm exec tsx scripts/seed-staging-content.ts --dry-run
 */

import { createHash } from "node:crypto"
import { getPayload } from "payload"

import config from "../src/payload.config"

// ─── Zakres zapisu ──────────────────────────────────────────────────────────

/** Kolekcje, do których ten skrypt może pisać. Lista zamknięta. */
const WRITABLE = ["menu-categories", "menu-items", "events", "resources"] as const

/**
 * Globals, które ten skrypt może nadpisać.
 *
 * `dish-of-day` świadomie poza listą: wskazuje pozycję menu relacją, więc
 * zapis wymagałby przeniesienia id z produkcji. Zostaje do ustawienia ręcznego.
 */
const WRITABLE_GLOBALS = ["site-settings"] as const

/**
 * Nigdy nie zapisywane. `media` jest tu mimo publicznego odczytu metadanych:
 * bez bajtów pliku wpis uploadu byłby wadliwy, a bajty trzeba wgrać osobno.
 */
const FORBIDDEN = [
  "reservations",
  "payments",
  "users",
  "occasional-inquiries",
  "blackouts",
  "media",
] as const

function assertScopeSane(): void {
  for (const slug of [...WRITABLE, ...WRITABLE_GLOBALS]) {
    if ((FORBIDDEN as readonly string[]).includes(slug)) {
      fail(`"${slug}" jest jednocześnie zapisywalny i zakazany — popraw listy.`)
    }
  }
}

/** Ostatnia bramka przed zapisem: nic poza listami nie przechodzi. */
function assertWritable(slug: string, isGlobal: boolean): void {
  const allowed: readonly string[] = isGlobal ? WRITABLE_GLOBALS : WRITABLE
  if (!allowed.includes(slug)) {
    fail(`Próba zapisu do "${slug}", którego nie ma na liście dozwolonych — przerwano.`)
  }
}

// ─── Źródło: tylko publiczne GET-y ──────────────────────────────────────────

const DEFAULT_SOURCE = "https://www.kregielnia-wielun.pl"

function sourceBase(): string {
  const raw = (process.env.SEED_SOURCE_URL || DEFAULT_SOURCE).trim().replace(/\/$/, "")
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return fail(`SEED_SOURCE_URL "${raw}" nie jest poprawnym URL-em.`)
  }
  if (url.protocol !== "https:") fail("Źródło musi być pobierane po HTTPS.")
  return raw
}

async function getJson(base: string, path: string): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { accept: "application/json" },
    redirect: "follow",
  })
  if (!res.ok) {
    fail(`GET ${path} zwrócił ${res.status}. Źródło niekompletne — przerwano.`)
  }
  const ct = res.headers.get("content-type") || ""
  if (!ct.includes("json")) {
    fail(`GET ${path} zwrócił "${ct}" zamiast JSON-a.`)
  }
  return res.json()
}

// ─── Walidacja celu ─────────────────────────────────────────────────────────

/**
 * Reguły parsowania celu są takie same jak w scripts/run-migrations.ts.
 * Celowo powielone, a nie wyniesione do wspólnego modułu: run-migrations.ts
 * jest pakowany esbuildem do obrazu i wchodzi w ścieżkę wdrożenia, więc jego
 * zmiana wymaga ponownej weryfikacji builda. Ujednolicenie to osobne zadanie.
 */
const TARGET_CHANGING_PARAMS = ["dbname", "host", "hostaddr", "port", "service", "options"]
const IDENTITY_TABLE = "db_environment_marker"
const PROVENANCE_TABLE = "seed_provenance"

type Target = { host: string; port: string; database: string }

function parseDatabaseUrl(raw: string | undefined): Target {
  if (!raw || raw.trim() === "") fail("DATABASE_URL jest pusty lub nieustawiony.")

  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return fail("DATABASE_URL nie jest poprawnym URL-em.")
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    fail(`Nieobsługiwany protokół "${url.protocol}".`)
  }
  if (url.hostname === "" || url.hostname.includes(",")) {
    fail("DATABASE_URL nie ma jednoznacznego hosta.")
  }
  for (const key of url.searchParams.keys()) {
    if (TARGET_CHANGING_PARAMS.includes(key.toLowerCase())) {
      fail(`DATABASE_URL zawiera parametr "${key}", który może zmienić cel połączenia.`)
    }
  }
  const path = url.pathname.replace(/^\//, "")
  if (path === "" || path.includes("/")) fail("DATABASE_URL nie zawiera jednoznacznej nazwy bazy.")

  return {
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(path),
  }
}

type PgLike = {
  query: (q: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}

/**
 * Znacznik MUSI istnieć i MUSI się zgadzać.
 *
 * W odróżnieniu od run-migrations.ts nie ma tu ścieżki "pusta baza → oznacz".
 * Seed nigdy nie nadaje tożsamości: pisze tylko tam, gdzie ktoś wcześniej
 * świadomie ją ustalił. Baza bez znacznika jest bazą nieznaną.
 */
async function assertStagingIdentity(client: PgLike): Promise<string> {
  const expected = (process.env.DB_ENVIRONMENT_ID || "").trim()
  if (!expected) fail("Brak DB_ENVIRONMENT_ID — nie wiadomo, które środowisko potwierdzamy.")

  const exists = await client.query(
    `SELECT to_regclass('public.${IDENTITY_TABLE}') IS NOT NULL AS present`,
  )
  if (exists.rows?.[0]?.present !== true) {
    fail(
      `Baza nie ma tabeli ${IDENTITY_TABLE}. Nie potrafię potwierdzić, że to staging — ` +
        `przerwano. Ten skrypt nigdy nie zakłada znacznika.`,
    )
  }

  const res = await client.query(`SELECT environment FROM ${IDENTITY_TABLE} LIMIT 1`)
  const found = res.rows?.[0]?.environment as string | undefined
  if (!found) fail(`Tabela ${IDENTITY_TABLE} jest pusta — tożsamość bazy niepotwierdzona.`)
  if (found !== expected) {
    fail(`Baza oznaczona jako "${found}", a DB_ENVIRONMENT_ID to "${expected}".`)
  }
  return found
}

// ─── Pochodzenie dokumentów ─────────────────────────────────────────────────

async function ensureProvenanceTable(client: PgLike): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${PROVENANCE_TABLE} (
       collection   text NOT NULL,
       natural_key  text NOT NULL,
       content_hash text NOT NULL,
       seeded_at    timestamptz NOT NULL DEFAULT now(),
       PRIMARY KEY (collection, natural_key)
     )`,
  )
}

async function loadProvenance(client: PgLike): Promise<Map<string, string>> {
  const exists = await client.query(
    `SELECT to_regclass('public.${PROVENANCE_TABLE}') IS NOT NULL AS present`,
  )
  if (exists.rows?.[0]?.present !== true) return new Map()

  const res = await client.query(
    `SELECT collection, natural_key, content_hash FROM ${PROVENANCE_TABLE}`,
  )
  const map = new Map<string, string>()
  for (const r of res.rows) map.set(`${r.collection}::${r.natural_key}`, String(r.content_hash))
  return map
}

async function recordProvenance(
  client: PgLike,
  collection: string,
  key: string,
  hash: string,
): Promise<void> {
  await client.query(
    `INSERT INTO ${PROVENANCE_TABLE} (collection, natural_key, content_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (collection, natural_key)
     DO UPDATE SET content_hash = EXCLUDED.content_hash, seeded_at = now()`,
    [collection, key, hash],
  )
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex").slice(0, 32)
}

/** Stabilna serializacja — kolejność kluczy nie może wpływać na hash. */
function canonical(value: unknown): string {
  if (value === undefined) return "null"
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(",")}}`
}

// ─── Plan ───────────────────────────────────────────────────────────────────

type Action = "CREATE" | "UPDATE" | "NOOP" | "SKIP_FOREIGN"

type PlanItem = {
  collection: string
  key: string
  action: Action
  reason?: string
  data: Record<string, unknown>
  /** Hash policzony po normalizacji — ta sama wartość ląduje w seed_provenance. */
  hash: string
  existingId?: string | number
  isGlobal?: boolean
}

/** Sprowadza obie strony porównania do postaci niezależnej od formatu zapisu. */
type Normalizer = (data: Record<string, unknown>) => Record<string, unknown>

const identityNormalizer: Normalizer = (d) => d

/** `day` wraca z bazy jako pełny timestamp, a ze źródła bywa inaczej sformatowany. */
const normalizeEvent: Normalizer = (d) => ({ ...d, day: dateOnly(d.day) })

function fail(message: string): never {
  console.error(`\n[seed] PRZERWANO: ${message}`)
  process.exit(1)
}

function log(...parts: unknown[]): void {
  console.log("[seed]", ...parts)
}

/** Odrzuca źródło, w którym klucz naturalny nie jest jednoznaczny. */
function assertKeysUnique(collection: string, keys: string[]): void {
  const seen = new Set<string>()
  for (const k of keys) {
    if (seen.has(k)) {
      fail(
        `Klucz naturalny "${k}" powtarza się w kolekcji ${collection}. ` +
          `Bez jednoznacznego klucza nie da się zapisywać idempotentnie.`,
      )
    }
    seen.add(k)
  }
}

/** Data kalendarzowa bez czasu — stabilna przy porównaniach i w kluczach. */
function dateOnly(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  const d = new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

/** Czy choć jedno pole ma wartość inną niż puste. */
function hasAnyValue(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some(
    (v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0),
  )
}

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k] = obj[k] ?? null
  return out
}

function classify(
  collection: string,
  key: string,
  desired: Record<string, unknown>,
  existing: Record<string, unknown> | undefined,
  provenance: Map<string, string>,
  force: boolean,
  isGlobal = false,
  normalize: Normalizer = identityNormalizer,
): PlanItem {
  const desiredHash = hashOf(normalize(desired))

  if (!existing) {
    return { collection, key, action: "CREATE", data: desired, hash: desiredHash, isGlobal }
  }

  const existingHash = hashOf(normalize(pick(existing, Object.keys(desired))))
  const existingId = existing.id as string | number | undefined
  const recorded = provenance.get(`${collection}::${key}`)

  if (existingHash === desiredHash) {
    return { collection, key, action: "NOOP", data: desired, hash: desiredHash, existingId, isGlobal }
  }

  // Dokument istnieje i różni się od źródła. Wolno go nadpisać tylko wtedy,
  // gdy jego obecna treść to dokładnie to, co seed zapisał ostatnio.
  if (recorded && recorded === existingHash) {
    return { collection, key, action: "UPDATE", data: desired, hash: desiredHash, existingId, isGlobal }
  }

  if (force) {
    return {
      collection,
      key,
      action: "UPDATE",
      reason: recorded ? "zmieniony ręcznie, nadpisany --force" : "obce pochodzenie, nadpisany --force",
      data: desired,
      hash: desiredHash,
      existingId,
      isGlobal,
    }
  }

  return {
    collection,
    key,
    action: "SKIP_FOREIGN",
    reason: recorded
      ? "istnieje i został zmieniony po ostatnim seedzie"
      : "istnieje, ale nie pochodzi z seeda",
    data: desired,
    hash: desiredHash,
    existingId,
    isGlobal,
  }
}

// ─── Odwzorowanie źródła na dokumenty ───────────────────────────────────────

type Snapshot = {
  siteSettings: Record<string, unknown>
  categories: any[]
  items: any[]
  events: any[]
  lanes: any[]
  billiards: any[]
  mediaMissing: string[]
}

async function fetchSnapshot(base: string): Promise<Snapshot> {
  log(`Źródło: ${base} (tylko GET)`)

  const [siteSettings, cats, items, events, lanes, billiards] = await Promise.all([
    getJson(base, "/api/globals/site-settings"),
    getJson(base, "/api/menu-categories?limit=1000&depth=0&sort=order"),
    getJson(base, "/api/menu-items?limit=1000&depth=0&sort=order"),
    getJson(base, "/api/events?limit=1000&depth=1"),
    getJson(base, "/api/reservations/resources?type=kregle"),
    getJson(base, "/api/reservations/resources?type=bilard"),
  ])

  // Pliki media: sprawdzamy osiągalność bajtów, ale ich nie replikujemy.
  const mediaMissing: string[] = []
  for (const ev of events.docs ?? []) {
    const file = ev?.image?.filename
    if (!file) continue
    try {
      const probe = await fetch(`${base}/api/media/file/${encodeURIComponent(file)}`, { method: "GET" })
      if (!probe.ok) mediaMissing.push(`${file} (HTTP ${probe.status})`)
      else await probe.arrayBuffer()
    } catch (err) {
      mediaMissing.push(`${file} (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  return {
    siteSettings: siteSettings as Record<string, unknown>,
    categories: cats.docs ?? [],
    items: items.docs ?? [],
    events: events.docs ?? [],
    lanes: lanes.resources ?? [],
    billiards: billiards.resources ?? [],
    mediaMissing,
  }
}

const SITE_SETTINGS_FIELDS = [
  "name",
  "slogan",
  "description",
  "phone",
  "email",
  "address",
  "nip",
  "facebook",
  "instagram",
  "openingHours",
]

/**
 * Pola wydarzenia przenoszone ze źródła.
 *
 * `startsAt` i `endsAt` są świadomie POMINIĘTE: hook beforeValidate w kolekcji
 * Events wylicza je z `day` + `startHour`/`startMinute` przez `setHours`, czyli
 * w strefie czasowej serwera. Zapisanie ich wprost nic nie da (hook je nadpisze),
 * a porównywanie ich prowadziłoby do wiecznego UPDATE, bo staging i produkcja
 * mogą liczyć je w innej strefie.
 */
const EVENT_FIELDS = [
  "title",
  "description",
  "kind",
  "pricePLN",
  "status",
  "day",
  "startHour",
  "startMinute",
  "endHour",
  "endMinute",
  "showOnHomepage",
  "blocksVenue",
  "blockAllDay",
  "capacity",
  "registrationsEnabled",
  "published",
]

// ─── Przebieg ───────────────────────────────────────────────────────────────

type Mode = "dry-run" | "apply" | "validate"

function parseArgs(): { mode: Mode; force: boolean } {
  const args = process.argv.slice(2)
  const unknown = args.filter((a) => !["--dry-run", "--apply", "--validate", "--force"].includes(a))
  if (unknown.length > 0) fail(`Nieznane argumenty: ${unknown.join(", ")}`)

  const modes = args.filter((a) => a !== "--force")
  if (modes.length > 1) fail(`Podano więcej niż jeden tryb: ${modes.join(", ")}`)

  const mode: Mode = modes[0] === "--apply" ? "apply" : modes[0] === "--validate" ? "validate" : "dry-run"
  const force = args.includes("--force")
  if (force && mode !== "apply") fail("--force ma sens tylko razem z --apply.")

  return { mode, force }
}

async function main(): Promise<void> {
  assertScopeSane()

  const { mode, force } = parseArgs()
  const target = parseDatabaseUrl(process.env.DATABASE_URL)
  const base = sourceBase()

  log(`Tryb: ${mode}${force ? " + force" : ""}`)
  log(`Cel: ${target.host}:${target.port}/${target.database}`)

  if (mode === "apply" && process.env.SEED_TARGET !== "true") {
    fail("SEED_TARGET != 'true'. Zapis wymaga jawnej zgody na tym środowisku.")
  }

  // 1. Tożsamość bazy — przed czymkolwiek innym.
  const { Client } = await import("pg")
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()
  } catch (err) {
    fail(`Nie udało się połączyć z ${target.host}:${target.port}/${target.database}: ${
      err instanceof Error ? err.message : String(err)
    }`)
  }

  const environment = await assertStagingIdentity(client)
  log(`Tożsamość bazy potwierdzona: "${environment}".`)

  const provenance = await loadProvenance(client)
  log(`Wpisów pochodzenia w bazie: ${provenance.size}`)

  // 2. Źródło.
  const snap = await fetchSnapshot(base)
  log(
    `Pobrano: kategorie ${snap.categories.length}, pozycje ${snap.items.length}, ` +
      `wydarzenia ${snap.events.length}, tory ${snap.lanes.length}, stoły ${snap.billiards.length}`,
  )

  // 3. Stan stagingu. Operacja administracyjna: bez `user`, więc celowo
  //    z pominięciem access control (wzorzec z AGENTS.md).
  const payload = await getPayload({ config })

  const existing: Record<string, Map<string, any>> = {}
  for (const slug of WRITABLE) {
    const res = await payload.find({ collection: slug, limit: 1000, depth: 0, pagination: false })
    existing[slug] = new Map()
    for (const doc of res.docs as any[]) existing[slug].set(naturalKey(slug, doc), doc)
  }

  const plan: PlanItem[] = []
  const notes: string[] = []

  // ── menu-categories ──
  {
    const desired = snap.categories.map((c) => ({
      name: String(c.name),
      order: Number(c.order ?? 0),
      active: Boolean(c.active),
    }))
    assertKeysUnique("menu-categories", desired.map((d) => d.name))
    for (const d of desired) {
      plan.push(classify("menu-categories", d.name, d, existing["menu-categories"].get(d.name), provenance, force))
    }
  }

  // ── menu-items ── kategoria po nazwie, nie po id produkcyjnym
  {
    const catNameById = new Map<string, string>()
    for (const c of snap.categories) catNameById.set(String(c.id), String(c.name))

    const desired = snap.items.map((i) => {
      const catName = catNameById.get(String(i.category))
      if (!catName) {
        fail(`Pozycja menu "${i.name}" wskazuje kategorię ${i.category}, której nie ma w źródle.`)
      }
      return {
        key: String(i.name),
        catName,
        data: {
          name: String(i.name),
          description: i.description ?? null,
          price: Number(i.price),
          order: Number(i.order ?? 0),
          active: Boolean(i.active),
          promo: {
            enabled: Boolean(i.promo?.enabled),
            promoPrice: i.promo?.promoPrice ?? null,
            startsAt: i.promo?.startsAt ?? null,
            endsAt: i.promo?.endsAt ?? null,
          },
        },
      }
    })
    assertKeysUnique("menu-items", desired.map((d) => d.key))
    for (const d of desired) {
      const item = classify(
        "menu-items",
        d.key,
        d.data,
        existing["menu-items"].get(d.key),
        provenance,
        force,
      )
      ;(item as any).categoryName = d.catName
      plan.push(item)
    }
  }

  // ── resources ──
  {
    const desired = [
      ...snap.lanes.map((r) => ({ type: "lane", number: Number(r.number), label: String(r.label ?? "") })),
      ...snap.billiards.map((r) => ({
        type: "billiard",
        number: Number(r.number),
        label: String(r.label ?? ""),
      })),
    ].map((r) => ({ ...r, active: true }))

    assertKeysUnique("resources", desired.map((d) => `${d.type}#${d.number}`))
    for (const d of desired) {
      const key = `${d.type}#${d.number}`
      plan.push(classify("resources", key, d, existing["resources"].get(key), provenance, force))
    }
    notes.push(
      "resources: źródło (/api/reservations/resources) zwraca tylko zasoby aktywne. " +
        "Zasoby nieaktywne i pole `notes` nie są replikowane.",
    )
  }

  // ── events ── obrazek pomijany, bo to upload
  {
    const desired = snap.events.map((e) => ({
      key: `${e.title}@${dateOnly(e.day)}`,
      data: pick(e, EVENT_FIELDS),
    }))
    assertKeysUnique("events", desired.map((d) => d.key))
    for (const d of desired) {
      plan.push(
        classify(
          "events",
          d.key,
          d.data,
          existing["events"].get(d.key),
          provenance,
          force,
          false,
          normalizeEvent,
        ),
      )
    }
    if (snap.events.some((e) => e.image)) {
      notes.push(
        "events: pole `image` wskazuje upload i NIE jest replikowane — obrazki wydarzeń " +
          "trzeba wgrać ręcznie do storage stagingowego.",
      )
    }
  }

  // ── globals ──
  {
    const desired = pick(snap.siteSettings, SITE_SETTINGS_FIELDS)
    const current = (await payload.findGlobal({ slug: "site-settings", depth: 0 })) as unknown as
      | Record<string, unknown>
      | undefined

    // Payload zwraca rekord globalsa także wtedy, gdy nikt go nie wypełnił.
    // Taki pusty rekord to brak danych, nie dane obcego pochodzenia — inaczej
    // pierwszy seed na świeżej bazie zawsze kończyłby się pominięciem.
    const existingGlobal = current && hasAnyValue(pick(current, SITE_SETTINGS_FIELDS)) ? current : undefined

    plan.push(
      classify("site-settings", "__global__", desired, existingGlobal, provenance, force, true),
    )
  }

  // ── raport treści nieodtwarzalnych ──
  notes.push(
    "reservation-settings: globals ma read: isStaffOrAdmin, publiczne API zwraca 403. " +
      "Cennik kręgli/bilarda, limity i flagi trzeba wpisać ręcznie w panelu stagingu.",
  )
  notes.push(
    "media: bajty plików nie są replikowane (kolekcja na liście FORBIDDEN). " +
      "Regulamin i polityka prywatności w PDF wymagają ręcznego uploadu na stagingu.",
  )
  notes.push(
    "dish-of-day: wskazuje pozycję menu relacją; zostaje do ustawienia ręcznego, " +
      "żeby nie zapisywać id z produkcji.",
  )
  if (snap.mediaMissing.length > 0) {
    notes.push(
      `media na produkcji NIEOSIĄGALNE przez HTTP: ${snap.mediaMissing.join(", ")} — ` +
        "plików nie da się pobrać nawet ręcznie z publicznego adresu.",
    )
  }

  // 4. Raport planu.
  printPlan(plan, notes, mode)

  if (mode === "validate") {
    // Rozbieżność w drugą stronę: co jest w stagingu, a czego nie ma w źródle.
    const sourceKeys = new Map<string, Set<string>>()
    for (const item of plan) {
      if (item.isGlobal) continue
      const set = sourceKeys.get(item.collection) ?? new Set<string>()
      set.add(item.key)
      sourceKeys.set(item.collection, set)
    }

    const extra: string[] = []
    for (const slug of WRITABLE) {
      const known = sourceKeys.get(slug) ?? new Set<string>()
      for (const key of existing[slug].keys()) {
        if (!known.has(key)) extra.push(`${slug}: ${key}`)
      }
    }

    if (extra.length > 0) {
      console.log("W STAGINGU, ALE NIE W ŹRÓDLE (seed tego nie usuwa):")
      for (const e of extra) console.log(`  • ${e}`)
      console.log()
    } else {
      log("Staging nie zawiera treści nadmiarowej względem źródła.")
    }
  }

  if (mode !== "apply") {
    log(mode === "validate" ? "Tryb validate — nic nie zapisano." : "Tryb dry-run — nic nie zapisano.")
    await client.end()
    process.exit(0)
  }

  // 5. Zapis.
  await ensureProvenanceTable(client)
  const catIdByName = new Map<string, string | number>()

  let created = 0
  let updated = 0

  for (const item of plan) {
    if (item.action === "NOOP" || item.action === "SKIP_FOREIGN") continue

    const data: Record<string, unknown> = { ...item.data }

    // Relacja kategorii rozwiązywana po nazwie na id stagingowe.
    if (item.collection === "menu-items") {
      const catName = (item as any).categoryName as string
      let catId = catIdByName.get(catName)
      if (!catId) {
        const found = await payload.find({
          collection: "menu-categories",
          where: { name: { equals: catName } },
          limit: 1,
          depth: 0,
        })
        catId = (found.docs[0] as any)?.id
        if (!catId) fail(`Nie znaleziono kategorii "${catName}" w stagingu po jej utworzeniu.`)
        catIdByName.set(catName, catId)
      }
      data.category = catId
    }

    assertWritable(item.collection, Boolean(item.isGlobal))

    if (item.isGlobal) {
      await payload.updateGlobal({ slug: item.collection as any, data: data as any, depth: 0 })
      updated++
    } else if (item.action === "CREATE") {
      const doc = await payload.create({ collection: item.collection as any, data: data as any, depth: 0 })
      if (item.collection === "menu-categories") catIdByName.set(item.key, (doc as any).id)
      created++
    } else {
      await payload.update({
        collection: item.collection as any,
        id: item.existingId as any,
        data: data as any,
        depth: 0,
      })
      updated++
    }

    await recordProvenance(client, item.collection, item.key, item.hash)
  }

  log(`Zapisano: utworzone ${created}, zaktualizowane ${updated}.`)
  await client.end()
  process.exit(0)
}

/** Klucz naturalny dokumentu już istniejącego w stagingu. */
function naturalKey(slug: string, doc: any): string {
  switch (slug) {
    case "menu-categories":
      return String(doc.name)
    case "menu-items":
      return String(doc.name)
    case "resources":
      return `${doc.type}#${doc.number}`
    case "events":
      return `${doc.title}@${dateOnly(doc.day)}`
    default:
      return String(doc.id)
  }
}

function printPlan(plan: PlanItem[], notes: string[], mode: Mode): void {
  const byCollection = new Map<string, Record<Action, number>>()
  for (const item of plan) {
    const row =
      byCollection.get(item.collection) ??
      ({ CREATE: 0, UPDATE: 0, NOOP: 0, SKIP_FOREIGN: 0 } as Record<Action, number>)
    row[item.action]++
    byCollection.set(item.collection, row)
  }

  console.log("\n───────────── PLAN ─────────────")
  console.log("kolekcja              nowe  zmiana  bez zmian  pominięte")
  for (const [slug, row] of byCollection) {
    console.log(
      `${slug.padEnd(22)}${String(row.CREATE).padStart(4)}${String(row.UPDATE).padStart(8)}` +
        `${String(row.NOOP).padStart(11)}${String(row.SKIP_FOREIGN).padStart(11)}`,
    )
  }

  const skipped = plan.filter((p) => p.action === "SKIP_FOREIGN")
  if (skipped.length > 0) {
    console.log("\nPOMINIĘTE (nie nadpisuję danych nieznanego pochodzenia):")
    for (const s of skipped) console.log(`  • ${s.collection}: ${s.key} — ${s.reason}`)
    console.log("  Nadpisanie wymaga --apply --force.")
  }

  const forced = plan.filter((p) => p.reason?.includes("--force"))
  if (forced.length > 0) {
    console.log("\nNADPISYWANE PRZEZ --force:")
    for (const f of forced) console.log(`  • ${f.collection}: ${f.key} — ${f.reason}`)
  }

  if (notes.length > 0) {
    console.log("\nNIE REPLIKOWANE / DO RĘCZNEGO UZUPEŁNIENIA:")
    for (const n of notes) console.log(`  • ${n}`)
  }
  console.log("────────────────────────────────\n")
}

main().catch((err) => {
  console.error("\n[seed] BŁĄD:", err instanceof Error ? err.stack || err.message : err)
  process.exit(1)
})
