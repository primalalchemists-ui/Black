/**
 * Bramka bezpieczeństwa dla testów integracyjnych.
 *
 * Testy integracyjne wymagają `PAYLOAD_DB_PUSH=true`, czyli pozwalają
 * Payloadowi ZMIENIĆ SCHEMAT bazy. Dlatego wybór bazy musi być pewny,
 * a nie oparty na dopasowaniu podciągiem.
 *
 * Polityka testowa trzyma się tutaj, a nie w `src/`, żeby nazwa bazy
 * testowej nie trafiała do kodu produkcyjnego. Sam rozbiór connection
 * stringa jest wspólny — `src/lib/dbSafety.ts`.
 *
 * Komunikaty błędów celowo NIE zawierają surowego `DATABASE_URL`,
 * żeby nie wypisać hasła do logów CI.
 */

import { parsePostgresConnectionUrl } from "../../src/lib/dbSafety"

/** Jedyna baza, na której wolno uruchamiać testy integracyjne. */
export const REQUIRED_TEST_DATABASE = "black_midnight_test"

export type GuardEnv = {
  NODE_ENV?: string
  PAYLOAD_DB_PUSH?: string
  DATABASE_URL?: string
}

export type GuardResult =
  | { ok: true; database: string; host: string; port: string }
  | { ok: false; reason: string }

/**
 * Sprawdza, czy konfiguracja wskazuje izolowaną, lokalną bazę testową.
 * Nie rzuca — zwraca wynik, co pozwala testować także ścieżki odrzucenia.
 */
export function checkIsolatedTestDatabase(env: GuardEnv = process.env): GuardResult {
  if (env.NODE_ENV !== "test") {
    return {
      ok: false,
      reason:
        `NODE_ENV = ${JSON.stringify(env.NODE_ENV)}, oczekiwano "test". ` +
        `Bez środowiska testowego Payload nie włączy push schematu.`,
    }
  }

  if (env.PAYLOAD_DB_PUSH !== "true") {
    return {
      ok: false,
      reason:
        `PAYLOAD_DB_PUSH = ${JSON.stringify(env.PAYLOAD_DB_PUSH)}, oczekiwano "true". ` +
        `Testy integracyjne stawiają schemat na izolowanej bazie.`,
    }
  }

  const parsed = parsePostgresConnectionUrl(env.DATABASE_URL)
  if (!parsed.ok) {
    return { ok: false, reason: `Nieprawidłowy DATABASE_URL: ${parsed.reason}` }
  }

  if (!parsed.isLocalHost) {
    return {
      ok: false,
      reason:
        `Host bazy "${parsed.host}" nie jest lokalny. Testy integracyjne wolno ` +
        `uruchamiać wyłącznie na 127.0.0.1, localhost lub ::1 — nigdy na bazie zdalnej.`,
    }
  }

  if (parsed.database !== REQUIRED_TEST_DATABASE) {
    return {
      ok: false,
      reason:
        `Nazwa bazy to "${parsed.database}", a wymagana jest dokładnie ` +
        `"${REQUIRED_TEST_DATABASE}". Przerwano, aby nie dotknąć innej bazy.`,
    }
  }

  return { ok: true, database: parsed.database, host: parsed.host, port: parsed.port }
}

/**
 * Wariant rzucający — wywoływany na samym początku pliku testowego,
 * PRZED `getPayload`, czyli przed jakimkolwiek połączeniem, zmianą
 * schematu czy utworzeniem danych testowych.
 */
export function assertIsolatedTestDatabase(env: GuardEnv = process.env): void {
  const result = checkIsolatedTestDatabase(env)
  if (!result.ok) {
    throw new Error(
      `[bramka bazy testowej] Odrzucono konfigurację połączenia.\n` +
        `  Powód: ${result.reason}\n` +
        `  Patrz: tests/int/README-integration.md`,
    )
  }
}
