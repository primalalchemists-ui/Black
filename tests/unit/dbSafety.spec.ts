import { describe, it, expect } from "vitest"
import {
  parsePostgresConnectionUrl,
  isLocalDatabaseHost,
  shouldPushSchema,
} from "@/lib/dbSafety"
import {
  checkIsolatedTestDatabase,
  assertIsolatedTestDatabase,
  REQUIRED_TEST_DATABASE,
} from "../helpers/isolatedTestDatabase"

/**
 * Testy zabezpieczeń wyboru bazy danych.
 *
 * Kontekst: testy integracyjne wymagają PAYLOAD_DB_PUSH=true, czyli pozwalają
 * Payloadowi zmienić schemat. Poprzednia bramka sprawdzała tylko podciąg
 * `/black_midnight_test/` w DATABASE_URL, co dawało się obejść.
 */

/** Stara, wadliwa bramka — zachowana, by udowodnić istnienie luki. */
function oldSubstringGuard(url: string): boolean {
  return /black_midnight_test/.test(url)
}

const VALID = `postgresql://postgres:testonly_midnight@127.0.0.1:55433/${REQUIRED_TEST_DATABASE}`

const TEST_ENV = {
  NODE_ENV: "test",
  PAYLOAD_DB_PUSH: "true",
  DATABASE_URL: VALID,
}

// ─── 1. Dowód, że stara bramka była do obejścia ─────────────────────────────

describe("luka: dopasowanie podciągiem dawało się obejść", () => {
  const bypasses: { label: string; url: string }[] = [
    {
      label: "nazwa bazy testowej w HAŚLE, połączenie do produkcji",
      url: "postgresql://admin:black_midnight_test@prod.example.com:5432/produkcja",
    },
    {
      label: "nazwa bazy testowej w LOGINIE",
      url: "postgresql://black_midnight_test:haslo@prod.example.com:5432/produkcja",
    },
    {
      label: "nazwa bazy testowej w NAZWIE HOSTA",
      url: "postgresql://u:p@black_midnight_test.example.com:5432/produkcja",
    },
    {
      label: "nazwa bazy testowej w QUERY STRINGU",
      url: "postgresql://u:p@127.0.0.1:5432/produkcja?application_name=black_midnight_test",
    },
    {
      label: "parametr dbname NADPISUJE bazę ze ścieżki",
      url: `postgresql://u:p@127.0.0.1:55433/${REQUIRED_TEST_DATABASE}?dbname=produkcja`,
    },
    {
      label: "parametr host przestawia faktyczny host",
      url: `postgresql://u:p@127.0.0.1:55433/${REQUIRED_TEST_DATABASE}?host=prod.example.com`,
    },
  ]

  for (const { label, url } of bypasses) {
    it(`stara bramka PRZEPUSZCZAŁA: ${label}`, () => {
      expect(oldSubstringGuard(url)).toBe(true)
    })

    it(`nowa bramka ODRZUCA: ${label}`, () => {
      const result = checkIsolatedTestDatabase({ ...TEST_ENV, DATABASE_URL: url })
      expect(result.ok).toBe(false)
    })
  }
})

// ─── 2. parsePostgresConnectionUrl ──────────────────────────────────────────

describe("parsePostgresConnectionUrl", () => {
  it("przyjmuje poprawny lokalny URL i wyciąga właściwe pola", () => {
    const r = parsePostgresConnectionUrl(VALID)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.database).toBe(REQUIRED_TEST_DATABASE)
    expect(r.host).toBe("127.0.0.1")
    expect(r.port).toBe("55433")
    expect(r.isLocalHost).toBe(true)
  })

  it("ignoruje login i hasło przy ustalaniu bazy", () => {
    const r = parsePostgresConnectionUrl(
      "postgresql://black_midnight_test:black_midnight_test@127.0.0.1:5432/produkcja",
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.database).toBe("produkcja")
  })

  it("odrzuca URL z niedozwolonym parametrem połączenia", () => {
    for (const param of ["dbname", "host", "hostaddr", "port", "service", "options", "passfile"]) {
      const r = parsePostgresConnectionUrl(`postgresql://u:p@127.0.0.1:5432/baza?${param}=x`)
      expect(r.ok, `parametr ${param} powinien zostać odrzucony`).toBe(false)
    }
  })

  it("dopuszcza nieszkodliwe parametry", () => {
    const r = parsePostgresConnectionUrl(
      `postgresql://u:p@127.0.0.1:55433/${REQUIRED_TEST_DATABASE}?sslmode=disable&application_name=x&connect_timeout=5`,
    )
    expect(r.ok).toBe(true)
  })

  it("odrzuca URL zniekształcony", () => {
    for (const bad of ["", "   ", "nie-url", "://brak", "postgresql://", "http//x"]) {
      expect(parsePostgresConnectionUrl(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })

  it("odrzuca wartości nie-tekstowe", () => {
    for (const bad of [undefined, null, 42, {}, []]) {
      expect(parsePostgresConnectionUrl(bad as unknown).ok).toBe(false)
    }
  })

  it("odrzuca nieobsługiwany protokół", () => {
    expect(parsePostgresConnectionUrl("mysql://u:p@127.0.0.1:3306/baza").ok).toBe(false)
    expect(parsePostgresConnectionUrl("http://127.0.0.1/baza").ok).toBe(false)
  })

  it("przyjmuje oba warianty protokołu postgres", () => {
    expect(parsePostgresConnectionUrl("postgres://u:p@127.0.0.1:5432/baza").ok).toBe(true)
    expect(parsePostgresConnectionUrl("postgresql://u:p@127.0.0.1:5432/baza").ok).toBe(true)
  })

  it("odrzuca brak nazwy bazy", () => {
    expect(parsePostgresConnectionUrl("postgresql://u:p@127.0.0.1:5432").ok).toBe(false)
    expect(parsePostgresConnectionUrl("postgresql://u:p@127.0.0.1:5432/").ok).toBe(false)
  })

  it("odrzuca ścieżkę z wieloma segmentami", () => {
    const r = parsePostgresConnectionUrl(
      `postgresql://u:p@127.0.0.1:5432/${REQUIRED_TEST_DATABASE}/produkcja`,
    )
    expect(r.ok).toBe(false)
  })

  it("odrzuca wiele hostów", () => {
    expect(parsePostgresConnectionUrl("postgresql://u:p@host1,host2:5432/baza").ok).toBe(false)
  })

  it("dekoduje percent-encoding w nazwie bazy", () => {
    const r = parsePostgresConnectionUrl("postgresql://u:p@127.0.0.1:5432/moja%20baza")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.database).toBe("moja baza")
  })

  it("odrzuca bajt zerowy w nazwie bazy", () => {
    const r = parsePostgresConnectionUrl(
      `postgresql://u:p@127.0.0.1:5432/${REQUIRED_TEST_DATABASE}%00produkcja`,
    )
    expect(r.ok).toBe(false)
  })
})

// ─── 3. isLocalDatabaseHost ─────────────────────────────────────────────────

describe("isLocalDatabaseHost", () => {
  it("rozpoznaje hosty lokalne", () => {
    for (const h of ["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]", " localhost "]) {
      expect(isLocalDatabaseHost(h), h).toBe(true)
    }
  })

  it("odrzuca hosty nielokalne", () => {
    for (const h of [
      "prod.example.com",
      "trolley.proxy.rlwy.net",
      "postgres", // host dockerowy z docker-compose — też nie jest lokalny
      "127.0.0.1.evil.com",
      "localhost.evil.com",
      "10.0.0.5",
    ]) {
      expect(isLocalDatabaseHost(h), h).toBe(false)
    }
  })
})

// ─── 4. Bramka bazy testowej ────────────────────────────────────────────────

describe("checkIsolatedTestDatabase", () => {
  it("przyjmuje dokładnie dozwoloną, lokalną bazę testową", () => {
    const r = checkIsolatedTestDatabase(TEST_ENV)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.database).toBe(REQUIRED_TEST_DATABASE)
    expect(r.host).toBe("127.0.0.1")
  })

  it("przyjmuje localhost zamiast 127.0.0.1", () => {
    const r = checkIsolatedTestDatabase({
      ...TEST_ENV,
      DATABASE_URL: `postgresql://u:p@localhost:55433/${REQUIRED_TEST_DATABASE}`,
    })
    expect(r.ok).toBe(true)
  })

  it("odrzuca nazwę bazy produkcyjnej", () => {
    const r = checkIsolatedTestDatabase({
      ...TEST_ENV,
      DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/railway",
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain("railway")
  })

  it("odrzuca bazę o nazwie zbliżonej (prefiks/sufiks)", () => {
    for (const db of [
      `${REQUIRED_TEST_DATABASE}_prod`,
      `prod_${REQUIRED_TEST_DATABASE}`,
      REQUIRED_TEST_DATABASE.toUpperCase(),
    ]) {
      const r = checkIsolatedTestDatabase({
        ...TEST_ENV,
        DATABASE_URL: `postgresql://u:p@127.0.0.1:5432/${db}`,
      })
      expect(r.ok, db).toBe(false)
    }
  })

  it("odrzuca host zdalny, nawet przy poprawnej nazwie bazy", () => {
    const r = checkIsolatedTestDatabase({
      ...TEST_ENV,
      DATABASE_URL: `postgresql://u:p@trolley.proxy.rlwy.net:32279/${REQUIRED_TEST_DATABASE}`,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain("nie jest lokalny")
  })

  it("odrzuca brak PAYLOAD_DB_PUSH", () => {
    expect(checkIsolatedTestDatabase({ ...TEST_ENV, PAYLOAD_DB_PUSH: undefined }).ok).toBe(false)
    expect(checkIsolatedTestDatabase({ ...TEST_ENV, PAYLOAD_DB_PUSH: "1" }).ok).toBe(false)
    expect(checkIsolatedTestDatabase({ ...TEST_ENV, PAYLOAD_DB_PUSH: "TRUE" }).ok).toBe(false)
  })

  it("odrzuca NODE_ENV inne niż test", () => {
    for (const e of ["production", "development", undefined]) {
      expect(checkIsolatedTestDatabase({ ...TEST_ENV, NODE_ENV: e }).ok, String(e)).toBe(false)
    }
  })

  it("odrzuca URL zniekształcony", () => {
    expect(checkIsolatedTestDatabase({ ...TEST_ENV, DATABASE_URL: "nie-url" }).ok).toBe(false)
    expect(checkIsolatedTestDatabase({ ...TEST_ENV, DATABASE_URL: undefined }).ok).toBe(false)
  })

  it("assertIsolatedTestDatabase rzuca z czytelnym powodem", () => {
    expect(() =>
      assertIsolatedTestDatabase({
        ...TEST_ENV,
        DATABASE_URL: "postgresql://u:p@prod.example.com:5432/railway",
      }),
    ).toThrow(/bramka bazy testowej/)
  })

  it("komunikat błędu NIE zawiera hasła", () => {
    const secret = "superTajneHaslo123"
    const r = checkIsolatedTestDatabase({
      ...TEST_ENV,
      DATABASE_URL: `postgresql://admin:${secret}@prod.example.com:5432/railway`,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).not.toContain(secret)
  })

  it("przepuszcza realną konfigurację testów integracyjnych", () => {
    expect(checkIsolatedTestDatabase(TEST_ENV).ok).toBe(true)
  })
})

// ─── 5. Ochrona push schematu ───────────────────────────────────────────────

describe("shouldPushSchema", () => {
  it("domyślnie false — pusty env", () => {
    expect(shouldPushSchema({})).toBe(false)
  })

  it("FALSE w produkcji, nawet gdy PAYLOAD_DB_PUSH=true", () => {
    expect(
      shouldPushSchema({
        NODE_ENV: "production",
        PAYLOAD_DB_PUSH: "true",
        DATABASE_URL: VALID,
      }),
    ).toBe(false)
  })

  it("FALSE w developmencie, nawet gdy PAYLOAD_DB_PUSH=true", () => {
    expect(
      shouldPushSchema({
        NODE_ENV: "development",
        PAYLOAD_DB_PUSH: "true",
        DATABASE_URL: VALID,
      }),
    ).toBe(false)
  })

  it("FALSE dla bazy ZDALNEJ, nawet gdy NODE_ENV=test i flaga ustawiona", () => {
    // Najważniejsza warstwa: push na zdalną bazę jest strukturalnie niemożliwy.
    for (const host of ["trolley.proxy.rlwy.net:32279", "prod.example.com:5432", "postgres:5432"]) {
      expect(
        shouldPushSchema({
          NODE_ENV: "test",
          PAYLOAD_DB_PUSH: "true",
          DATABASE_URL: `postgresql://u:p@${host}/${REQUIRED_TEST_DATABASE}`,
        }),
        host,
      ).toBe(false)
    }
  })

  it("FALSE bez jawnego opt-inu", () => {
    expect(shouldPushSchema({ NODE_ENV: "test", DATABASE_URL: VALID })).toBe(false)
    expect(
      shouldPushSchema({ NODE_ENV: "test", PAYLOAD_DB_PUSH: "1", DATABASE_URL: VALID }),
    ).toBe(false)
  })

  it("FALSE przy zniekształconym DATABASE_URL", () => {
    expect(
      shouldPushSchema({ NODE_ENV: "test", PAYLOAD_DB_PUSH: "true", DATABASE_URL: "nie-url" }),
    ).toBe(false)
    expect(shouldPushSchema({ NODE_ENV: "test", PAYLOAD_DB_PUSH: "true" })).toBe(false)
  })

  it("FALSE gdy parametr połączenia mógłby przestawić cel", () => {
    expect(
      shouldPushSchema({
        NODE_ENV: "test",
        PAYLOAD_DB_PUSH: "true",
        DATABASE_URL: `postgresql://u:p@127.0.0.1:55433/${REQUIRED_TEST_DATABASE}?host=prod.example.com`,
      }),
    ).toBe(false)
  })

  it("TRUE wyłącznie dla kompletnej, lokalnej konfiguracji testowej", () => {
    expect(
      shouldPushSchema({ NODE_ENV: "test", PAYLOAD_DB_PUSH: "true", DATABASE_URL: VALID }),
    ).toBe(true)
  })
})
