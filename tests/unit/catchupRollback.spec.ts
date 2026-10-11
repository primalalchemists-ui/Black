import { describe, it, expect, beforeEach, afterEach } from "vitest"

import { down, up } from "@/migrations/20261011_catchup_missing_schema"

/**
 * Bramka wycofania migracji wyrównującej.
 *
 * `up` dodaje kolumny przez ADD COLUMN IF NOT EXISTS, więc na bazie, która już
 * je miała (np. produkcja, gdzie powstały poza łańcuchem migracji), nie tworzy
 * niczego. Wcześniejsze `down` dropowało je bezwarunkowo — co skasowałoby dane,
 * których ta migracja nigdy nie była właścicielem.
 */

type Executed = { sql: string }

function makeDb(rows: Array<Record<string, unknown>> = [{ n: 0 }]) {
  const executed: Executed[] = []
  return {
    executed,
    db: {
      execute: async (q: unknown) => {
        // Drizzle składa zapytanie z fragmentów; do asercji wystarczy tekst.
        executed.push({ sql: JSON.stringify(q) })
        return { rows }
      },
    } as never,
  }
}

const args = (db: never) => ({ db, payload: {} as never, req: {} as never }) as never

let envBefore: string | undefined

beforeEach(() => {
  envBefore = process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK
  delete process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK
})

afterEach(() => {
  if (envBefore === undefined) delete process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK
  else process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK = envBefore
})

describe("down() — fail closed", () => {
  it("bez jawnej zgody odmawia i NIE wykonuje żadnego zapytania", async () => {
    const { db, executed } = makeDb()
    await expect(down(args(db))).rejects.toThrow(/zablokowane/i)
    expect(executed).toHaveLength(0)
  })

  it("komunikat wskazuje zmienną odblokowującą i zapytanie weryfikacyjne", async () => {
    const { db } = makeDb()
    await expect(down(args(db))).rejects.toThrow(/ALLOW_CATCHUP_SCHEMA_ROLLBACK/)
    await expect(down(args(db))).rejects.toThrow(/invoice_invoice_type/)
  })

  it("wartość inna niż dokładnie 'true' nie odblokowuje", async () => {
    for (const v of ["1", "TRUE", "yes", "True", ""]) {
      process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK = v
      const { db, executed } = makeDb()
      await expect(down(args(db)), `wartość ${JSON.stringify(v)}`).rejects.toThrow(/zablokowane/i)
      expect(executed).toHaveLength(0)
    }
  })
})

describe("down() — po odblokowaniu nadal chroni dane", () => {
  beforeEach(() => {
    process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK = "true"
  })

  it("odmawia, gdy invoice_invoice_type zawiera dane", async () => {
    const { db, executed } = makeDb([{ n: 7 }])
    await expect(down(args(db))).rejects.toThrow(/7 niepustych/)
    // Wykonano wyłącznie zapytanie sprawdzające — żadnego DROP.
    expect(executed).toHaveLength(1)
  })

  it("wykonuje DROP dopiero, gdy kolumna jest pusta", async () => {
    const { db, executed } = makeDb([{ n: 0 }])
    await expect(down(args(db))).resolves.toBeUndefined()
    // 1 sprawdzenie + 3 DROP COLUMN + 1 DROP TYPE
    expect(executed).toHaveLength(5)
  })
})

describe("up() — operacje niezmienione", () => {
  it("wykonuje dokładnie 4 zapytania: CREATE TYPE + 3 ADD COLUMN", async () => {
    const { db, executed } = makeDb()
    await expect(up(args(db))).resolves.toBeUndefined()
    expect(executed).toHaveLength(4)
  })

  it("nie zależy od zmiennej odblokowującej rollback", async () => {
    process.env.ALLOW_CATCHUP_SCHEMA_ROLLBACK = "true"
    const { db, executed } = makeDb()
    await up(args(db))
    expect(executed).toHaveLength(4)
  })
})
