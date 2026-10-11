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

function assertAllowed(target: Target): void {
  if (process.env.RUN_DB_MIGRATIONS !== "true") {
    fail(
      "RUN_DB_MIGRATIONS != 'true'. Migracje wymagają jawnej zgody na tym środowisku. " +
        "Ustaw RUN_DB_MIGRATIONS=true tylko tam, gdzie świadomie chcesz je uruchamiać.",
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
async function assertDatabaseExists(connectionString: string, target: Target): Promise<void> {
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

  await client.end().catch(() => {})
  console.log("[migrate] Połączenie i istnienie bazy potwierdzone.")
}

/**
 * Dodatkowa bramka na PIERWSZE wdrożenie stagingu.
 *
 * Deklaracje hosta i nazwy bazy nie odróżnią dwóch środowisk Railway, jeśli
 * oba mają bazę `railway` pod `postgres.railway.internal`. Ta bramka odróżni
 * je niezawodnie: produkcja NIE jest pusta, więc przy DB_MIGRATION_EXPECT_EMPTY=true
 * pomyłkowe wycelowanie w produkcję zatrzyma się, zanim cokolwiek zmieni.
 */
async function assertEmptyIfRequired(pool: {
  query: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }>
}): Promise<void> {
  if (process.env.DB_MIGRATION_EXPECT_EMPTY !== "true") return

  const res = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`,
  )
  const tableCount = Number(res.rows?.[0]?.n ?? 0)

  if (tableCount !== 0) {
    fail(
      `DB_MIGRATION_EXPECT_EMPTY=true, ale baza zawiera ${tableCount} tabel w schemacie public. ` +
        `To nie jest świeża baza. Jeśli to celowe, zdejmij DB_MIGRATION_EXPECT_EMPTY.`,
    )
  }

  console.log("[migrate] Baza jest pusta — zgodnie z DB_MIGRATION_EXPECT_EMPTY=true.")
}

// ─── Przebieg ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const target = parseDatabaseUrl(process.env.DATABASE_URL)

  console.log(`[migrate] Cel: ${describe(target)}`)
  console.log(`[migrate] Migracji w pakiecie: ${migrations.length}`)

  assertAllowed(target)
  await assertDatabaseExists(process.env.DATABASE_URL!, target)

  const payload = await getPayload({ config })

  const pool = (payload.db as unknown as { pool?: { query: (q: string) => Promise<any> } }).pool
  if (!pool?.query) {
    fail("Brak dostępu do puli połączeń adaptera — nie mogę zweryfikować stanu bazy.")
  }

  await assertEmptyIfRequired(pool!)

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
