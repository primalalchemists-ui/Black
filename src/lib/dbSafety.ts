/**
 * Zabezpieczenia wyboru bazy danych.
 *
 * Dwa niezależne cele:
 *
 * 1. `parsePostgresConnectionUrl` — STRUKTURALNY rozbiór connection stringa.
 *    Dopasowanie podciągiem (`/black_midnight_test/.test(url)`) jest
 *    niewystarczające, bo ta sama nazwa może wystąpić w loginie, haśle,
 *    nazwie hosta albo w query stringu, podczas gdy połączenie faktycznie
 *    celuje w inną bazę. Przykłady, które przechodziły test podciągiem,
 *    a celują gdzie indziej:
 *
 *      postgresql://u:black_midnight_test@prod.example.com/produkcja
 *      postgresql://u:p@black_midnight_test.example.com/produkcja
 *      postgresql://u:p@127.0.0.1/produkcja?application_name=black_midnight_test
 *      postgresql://u:p@127.0.0.1/black_midnight_test?dbname=produkcja
 *
 *    Ostatni przypadek jest najpodstępniejszy: parametr `dbname` w query
 *    stringu NADPISUJE bazę z ścieżki URL-a. Analogicznie `host`, `hostaddr`,
 *    `port`, `service` i `options` potrafią przestawić faktyczny cel
 *    połączenia. Dlatego parametry przechodzą przez wąską listę dozwolonych,
 *    a wszystko poza nią jest odrzucane.
 *
 * 2. `shouldPushSchema` — czy wolno pozwolić Payloadowi na `push` schematu.
 *    Produkcja zmienia schemat WYŁĄCZNIE migracjami z `src/migrations`.
 */

/** Parametry połączenia, które nie mogą zmienić celu połączenia. */
const ALLOWED_QUERY_PARAMS = new Set(["sslmode", "application_name", "connect_timeout"])

/** Hosty uznawane za lokalne. `new URL` zwraca IPv6 w nawiasach. */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

export type ParsedPostgresUrl = {
  ok: true
  /** Nazwa bazy po zdekodowaniu percent-encoding. */
  database: string
  /** Host znormalizowany do małych liter (bez nawiasów dla IPv6). */
  host: string
  port: string
  isLocalHost: boolean
}

export type ParseFailure = {
  ok: false
  reason: string
}

/** Czy host jest lokalny? Przyjmuje host z `URL.hostname` lub surowy. */
export function isLocalDatabaseHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "")
  return LOCAL_HOSTS.has(normalized) || LOCAL_HOSTS.has(`[${normalized}]`)
}

/**
 * Rozbiera connection string PostgreSQL i odrzuca konfiguracje niejednoznaczne
 * lub potencjalnie niebezpieczne.
 *
 * Celowo NIE próbuje obsłużyć pełnej składni libpq (plików `service`,
 * `passfile`, wielu hostów itd.) — zamiast zgadywać, odrzuca wszystko,
 * czego nie rozumie w sposób jednoznaczny.
 */
export function parsePostgresConnectionUrl(raw: unknown): ParsedPostgresUrl | ParseFailure {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, reason: "DATABASE_URL jest puste lub nie jest tekstem." }
  }

  const value = raw.trim()

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, reason: "DATABASE_URL nie jest poprawnym URL-em." }
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return {
      ok: false,
      reason: `Nieobsługiwany protokół "${url.protocol}" — oczekiwano postgres: lub postgresql:.`,
    }
  }

  // Wiele hostów (np. "host1,host2") czyni cel niejednoznacznym.
  if (url.hostname.includes(",")) {
    return { ok: false, reason: "DATABASE_URL zawiera wiele hostów — cel jest niejednoznaczny." }
  }

  if (url.hostname === "") {
    return { ok: false, reason: "DATABASE_URL nie zawiera hosta." }
  }

  // Parametry mogące przestawić cel połączenia (dbname/host/port/service/options).
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key.toLowerCase())) {
      return {
        ok: false,
        reason:
          `Niedozwolony parametr połączenia "${key}". Parametry takie jak dbname, host, ` +
          `hostaddr, port, service czy options mogą zmienić faktyczny cel połączenia.`,
      }
    }
  }

  // Ścieżka musi być dokładnie jednym segmentem: "/nazwa_bazy".
  const path = url.pathname
  if (!path.startsWith("/")) {
    return { ok: false, reason: "DATABASE_URL nie zawiera nazwy bazy." }
  }

  const rawDatabase = path.slice(1)
  if (rawDatabase === "") {
    return { ok: false, reason: "DATABASE_URL nie zawiera nazwy bazy." }
  }
  if (rawDatabase.includes("/")) {
    return {
      ok: false,
      reason: `Ścieżka "${path}" zawiera więcej niż jeden segment — nazwa bazy jest niejednoznaczna.`,
    }
  }

  let database: string
  try {
    database = decodeURIComponent(rawDatabase)
  } catch {
    return { ok: false, reason: "Nazwa bazy ma nieprawidłowe percent-encoding." }
  }

  if (database.includes("\u0000")) {
    return { ok: false, reason: "Nazwa bazy zawiera bajt zerowy." }
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")

  return {
    ok: true,
    database,
    host,
    port: url.port,
    isLocalHost: isLocalDatabaseHost(url.hostname),
  }
}

/**
 * Czy Payload może zmieniać schemat przez `push`?
 *
 * Trzy niezależne warunki — wszystkie muszą być spełnione:
 *
 *   1. `NODE_ENV === "test"` — Vitest ustawia to sam (zweryfikowane:
 *      pod `vitest run` process.env.NODE_ENV === "test"). `next build`
 *      i `next start` dają "production", `next dev` — "development".
 *   2. `PAYLOAD_DB_PUSH === "true"` — jawny opt-in, ścisłe porównanie.
 *   3. Baza jest LOKALNA — nawet przy obu flagach ustawionych omyłkowo
 *      na zdalnym środowisku push się nie włączy. To ta warstwa czyni
 *      modyfikację zdalnego schematu strukturalnie niemożliwą.
 *
 * Produkcyjna wartość domyślna pozostaje `false`.
 */
export function shouldPushSchema(
  env: { NODE_ENV?: string; PAYLOAD_DB_PUSH?: string; DATABASE_URL?: string } = process.env,
): boolean {
  if (env.NODE_ENV !== "test") return false
  if (env.PAYLOAD_DB_PUSH !== "true") return false

  const parsed = parsePostgresConnectionUrl(env.DATABASE_URL)
  if (!parsed.ok) return false

  return parsed.isLocalHost
}
