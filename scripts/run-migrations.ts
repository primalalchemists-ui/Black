/**
 * Kontrolowane uruchomienie migracji Payload.
 *
 * Przeznaczenie: komenda Pre-deploy na Railway. Pre-deploy startuje PO
 * zbudowaniu obrazu, a PRZED uruchomieniem aplikacji, ma dostęp do sieci
 * prywatnej i zmiennych runtime, a niezerowy kod wyjścia zatrzymuje wdrożenie.
 *
 * ── DLACZEGO NIE `payload migrate` ────────────────────────────────────────────
 *
 * Finalny obraz zawiera wyłącznie output `next build --output standalone`.
 * Sprawdzone w zbudowanym obrazie: /app/node_modules ma 6 pakietów
 * (@aws-sdk, graphql, next, react, sharp, typescript). Nie ma w nim ani
 * `payload`, ani `@payloadcms/*`, ani `pg`, ani katalogu .bin — Next wkompilował
 * te zależności w .next/server/chunks. CLI Payloada nie istnieje w runtime,
 * a migracje (`src/migrations/*.ts`) nie są w ogóle śledzone przez tracing,
 * bo `payload.config.ts` ich nie importuje.
 *
 * Dlatego ten plik jest w czasie builda pakowany esbuildem do jednego
 * samowystarczalnego `migrate.mjs`, który ląduje w obrazie obok `server.js`.
 * Migracje są tu importowane statycznie, więc bundler je widzi.
 *
 * Nie przepisujemy logiki migracji: uruchamiamy natywne
 * `payload.db.migrate({ migrations })`. Adapter drizzle jawnie wspiera podanie
 * gotowej tablicy migracji zamiast czytania ich z dysku
 * (`@payloadcms/drizzle/dist/migrate.js`: `args?.migrations || readMigrationFiles(...)`),
 * więc tabela `payload_migrations`, transakcje i kolejność działają dokładnie
 * tak, jak przy `payload migrate`.
 *
 * ── ZABEZPIECZENIA ────────────────────────────────────────────────────────────
 *
 * Skrypt odmawia działania, dopóki operator nie potwierdzi JAWNIE, w co celuje.
 * Nie opiera się na NODE_ENV — w obrazie produkcyjnym jest on zawsze
 * "production", także na stagingu, więc nie odróżnia tych środowisk.
 */

import { getPayload } from "payload"

import config from "../src/payload.config"
import { migrations } from "../src/migrations"

// ─── Parsowanie i walidacja celu połączenia ─────────────────────────────────

/** Parametry libpq, które potrafią przestawić faktyczny cel połączenia. */
const TARGET_CHANGING_PARAMS = ["dbname", "host", "hostaddr", "port", "service", "options"]

type Target = { host: string; port: string; database: string }

function parseDatabaseUrl(raw: string | undefined): Target {
  if (!raw || raw.trim() === "") {
    fail("DATABASE_URL jest pusty lub nieustawiony.")
  }

  let url: URL
  try {
    url = new URL(raw!.trim())
  } catch {
    fail("DATABASE_URL nie jest poprawnym URL-em.")
  }

  if (url!.protocol !== "postgres:" && url!.protocol !== "postgresql:") {
    fail(`Nieobsługiwany protokół "${url!.protocol}" — oczekiwano postgres: lub postgresql:.`)
  }
  if (url!.hostname === "" || url!.hostname.includes(",")) {
    fail("DATABASE_URL nie ma jednoznacznego hosta.")
  }

  for (const key of url!.searchParams.keys()) {
    if (TARGET_CHANGING_PARAMS.includes(key.toLowerCase())) {
      fail(
        `DATABASE_URL zawiera parametr "${key}", który może zmienić faktyczny cel ` +
          `połączenia. Usuń go — cel musi wynikać wprost z URL-a.`,
      )
    }
  }

  const path = url!.pathname.replace(/^\//, "")
  if (path === "" || path.includes("/")) {
    fail("DATABASE_URL nie zawiera jednoznacznej nazwy bazy.")
  }

  let database: string
  try {
    database = decodeURIComponent(path)
  } catch {
    fail("Nazwa bazy w DATABASE_URL ma nieprawidłowe percent-encoding.")
  }

  return {
    host: url!.hostname.toLowerCase(),
    port: url!.port || "5432",
    database: database!,
  }
}

function fail(message: string): never {
  console.error(`[migrate] PRZERWANO: ${message}`)
  process.exit(1)
}

/** Nigdy nie loguje użytkownika ani hasła. */
function describe(t: Target): string {
  return `${t.host}:${t.port}/${t.database}`
}

// ─── Bramki ─────────────────────────────────────────────────────────────────

/** Tabela-znacznik tożsamości. Poza modelem Payloada, nie dotyka jej push ani migracje. */
const IDENTITY_TABLE = "db_environment_marker"

function assertAllowed(target: Target): void {
  if (process.env.RUN_DB_MIGRATIONS !== "true") {
    fail(
      "RUN_DB_MIGRATIONS != 'true'. Migracje wymagają jawnej zgody na tym środowisku. " +
        "Ustaw RUN_DB_MIGRATIONS=true tylko tam, gdzie świadomie chcesz je uruchamiać.",
    )
  }

  if (!process.env.DB_ENVIRONMENT_ID || process.env.DB_ENVIRONMENT_ID.trim() === "") {
    fail(
      "Brak DB_ENVIRONMENT_ID. Każde środowisko musi mieć własny, stały identyfikator " +
        "(np. 'black-staging'), zapisywany w samej bazie przy pierwszym uruchomieniu.",
    )
  }

  const expectedHost = process.env.DB_MIGRATION_EXPECTED_HOST
  const expectedDatabase = process.env.DB_MIGRATION_EXPECTED_DATABASE

  if (!expectedHost || !expectedDatabase) {
    fail(
      "Brak DB_MIGRATION_EXPECTED_HOST lub DB_MIGRATION_EXPECTED_DATABASE. " +
        "Operator musi jawnie zadeklarować, w którą bazę celujemy — bez tego nie ruszamy.",
    )
  }

  if (target.host !== expectedHost.trim().toLowerCase()) {
    fail(
      `Host bazy to "${target.host}", a zadeklarowano "${expectedHost}". ` +
        `DATABASE_URL wskazuje inne środowisko, niż zakładano.`,
    )
  }

  if (target.database !== expectedDatabase.trim()) {
    fail(
      `Nazwa bazy to "${target.database}", a zadeklarowano "${expectedDatabase}". ` +
        `DATABASE_URL wskazuje inne środowisko, niż zakładano.`,
    )
  }
}

/**
 * Baza MUSI już istnieć.
 *
 * Adapter Payloada sam tworzy brakującą bazę
 * (`@payloadcms/db-postgres/dist/connect.js`: przechwytuje
 * "database ... does not exist" i wywołuje createDatabase()). Zweryfikowane
 * w kontenerze: wskazanie nieistniejącej bazy kończyło się kodem 0, bo adapter
 * po cichu zakładał nową i migrował pustkę.
 *
 * Dla kroku Pre-deploy to złe zachowanie: literówka w nazwie bazy dawałaby
 * "udane" wdrożenie wycelowane w świeżą, pustą bazę. Dlatego łączymy się
 * najpierw czystym klientem `pg`, który nie tworzy niczego — jeśli baza nie
 * istnieje, przerywamy, zanim Payload zdąży ją założyć.
 *
 * Przy okazji weryfikuje poświadczenia, zanim ruszy cały init Payloada.
 */
async function connectPlain(connectionString: string, target: Target) {
  const { Client } = await import("pg")
  const client = new Client({ connectionString })

  try {
    await client.connect()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/database .* does not exist/i.test(message)) {
      fail(
        `Baza "${target.database}" nie istnieje na ${target.host}:${target.port}. ` +
          `Nie zakładamy jej automatycznie — sprawdź DATABASE_URL.`,
      )
    }
    // Komunikat sterownika nie zawiera hasła.
    fail(`Nie udało się połączyć z ${describe(target)}: ${message}`)
  }

  console.log("[migrate] Połączenie i istnienie bazy potwierdzone.")
  return client
}

/**
 * TRWAŁA TOŻSAMOŚĆ BAZY — najmocniejsze zabezpieczenie w tym skrypcie.
 *
 * Deklaracje hosta i nazwy bazy nie odróżnią dwóch środowisk Railway, bo oba
 * projekty mogą mieć bazę `railway` pod `postgres.railway.internal`. Dlatego
 * tożsamość jest zapisywana W SAMEJ BAZIE i sprawdzana przy każdym kolejnym
 * uruchomieniu — wiąże migracje z konkretną instancją, nie z adresem.
 *
 * Przebieg:
 *
 *   • Znacznik istnieje → musi być równy DB_ENVIRONMENT_ID. Każda inna wartość
 *     (albo jej brak przy niepustej bazie) zatrzymuje wdrożenie.
 *   • Znacznika nie ma → to może być TYLKO pierwsze uruchomienie, więc baza
 *     musi być całkowicie pusta. Produkcja pusta nie jest, więc pomyłkowe
 *     wycelowanie w nią zatrzyma się tutaj.
 *
 * Wymóg pustej bazy jest BEZWARUNKOWY (fail-closed) — nie da się go wyłączyć
 * flagą ani o nim zapomnieć.
 *
 * Znacznik zapisujemy PRZED migracjami, nie po. Gdyby migracja padła w połowie,
 * baza byłaby już niepusta: bez wcześniejszego znacznika kolejne uruchomienie
 * utknęłoby na wymogu pustej bazy i zablokowało naprawę.
 *
 * Utworzenie tabeli znacznika jest pierwszą i jedyną zmianą schematu
 * wykonywaną przed właściwymi migracjami — i następuje dopiero po przejściu
 * kontroli pustości.
 */
async function assertDatabaseIdentity(client: {
  query: (q: string, v?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}): Promise<void> {
  const expected = process.env.DB_ENVIRONMENT_ID!.trim()

  const markerExists = await client.query(
    `SELECT to_regclass('public.${IDENTITY_TABLE}') IS NOT NULL AS present`,
  )

  if (markerExists.rows?.[0]?.present === true) {
    const res = await client.query(`SELECT environment FROM ${IDENTITY_TABLE} LIMIT 1`)
    const found = res.rows?.[0]?.environment as string | undefined

    if (!found) {
      fail(
        `Tabela ${IDENTITY_TABLE} istnieje, ale jest pusta. Nie potrafię potwierdzić ` +
          `tożsamości tej bazy — przerwano.`,
      )
    }
    if (found !== expected) {
      fail(
        `Ta baza jest oznaczona jako środowisko "${found}", a DB_ENVIRONMENT_ID to ` +
          `"${expected}". DATABASE_URL wskazuje inne środowisko, niż zakładano.`,
      )
    }

    console.log(`[migrate] Tożsamość bazy potwierdzona: "${found}".`)
    return
  }

  // Brak znacznika → dopuszczamy wyłącznie całkowicie pustą bazę.
  const res = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  )
  const tableCount = Number(res.rows?.[0]?.n ?? 0)

  if (tableCount !== 0) {
    fail(
      `Baza nie ma znacznika środowiska, ale zawiera ${tableCount} tabel w schemacie public. ` +
        `Nie mogę potwierdzić, że to właśnie "${expected}" — przerwano, zanim cokolwiek zmieniono. ` +
        `Jeśli to świadomie ta baza, oznacz ją ręcznie: ` +
        `CREATE TABLE ${IDENTITY_TABLE} (environment text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()); ` +
        `INSERT INTO ${IDENTITY_TABLE} (environment) VALUES ('${expected}');`,
    )
  }

  await client.query(
    `CREATE TABLE ${IDENTITY_TABLE} (
       environment text PRIMARY KEY,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await client.query(`INSERT INTO ${IDENTITY_TABLE} (environment) VALUES ($1)`, [expected])

  console.log(`[migrate] Pusta baza — oznaczono jako środowisko "${expected}".`)
}

// ─── Przebieg ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const target = parseDatabaseUrl(process.env.DATABASE_URL)

  console.log(`[migrate] Cel: ${describe(target)}`)
  console.log(`[migrate] Migracji w pakiecie: ${migrations.length}`)

  assertAllowed(target)

  // Wszystkie kontrole celu wykonujemy na czystym kliencie pg, ZANIM
  // zainicjalizujemy Payload — jego adapter potrafi sam utworzyć brakującą bazę.
  const client = await connectPlain(process.env.DATABASE_URL!, target)
  try {
    await assertDatabaseIdentity(client)
  } finally {
    await client.end().catch(() => {})
  }

  const payload = await getPayload({ config })

  console.log("[migrate] Uruchamiam payload.db.migrate()…")
  await (payload.db as unknown as { migrate: (a: { migrations: typeof migrations }) => Promise<void> }).migrate({
    migrations,
  })

  console.log("[migrate] Zakończono pomyślnie.")
}

main()
  // Payload trzyma otwarte uchwyty (pula połączeń, logger), więc proces nie
  // zakończyłby się sam — a wiszący Pre-deploy zablokowałby wdrożenie.
  // Kończymy jawnie, dopiero PO rozwiązaniu się migracji.
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    // Żadnego połykania błędów: niezerowy kod wyjścia zatrzymuje wdrożenie.
    console.error("[migrate] BŁĄD migracji:")
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
    process.exit(1)
  })
