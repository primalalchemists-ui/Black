// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest"

import {
  MailPolicyError,
  applyRecipientPolicy,
  extractAddress,
  normalizeRecipients,
  requireTestRecipient,
  resolveMailMode,
} from "@/lib/mailPolicy"
import { effectiveTo, withRecipientPolicy } from "@/lib/mail"

/**
 * Zabezpieczenia adresatów poczty.
 *
 * Testy sprawdzają wymuszenie w TRANSPORCIE, bo właśnie konwencja zawiodła:
 * `/api/inquiries/occasional` wysyłał na adres z formularza, nie wywołując
 * `effectiveTo()`. Scenariusz „wywołujący podaje surowy adres klienta" jest
 * tu odtworzony wprost.
 */

const TESTER = "tester@example.com"
const CUSTOMER = "klient-z-formularza@example.org"
const OWNER = "wlasciciel@example.net"

const BASE = {
  from: "BLACK <rezerwacje@example.com>",
  subject: "Potwierdzenie rezerwacji",
  text: "treść",
}

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {
    EMAIL_MODE: process.env.EMAIL_MODE,
    RESERVATION_TEST_EMAIL: process.env.RESERVATION_TEST_EMAIL,
    MAIL_TO_OWNER: process.env.MAIL_TO_OWNER,
  }
  for (const k of Object.keys(saved)) delete process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

/** Atrapa klienta Resend — zapisuje to, co naprawdę poszłoby do API. */
function stubClient() {
  const sent: Array<Record<string, unknown>> = []
  const client = {
    emails: {
      send: async (params: Record<string, unknown>) => {
        sent.push(params)
        return { data: { id: "stub" }, error: null }
      },
    },
  }
  return { sent, guarded: withRecipientPolicy(client as never) }
}

// ─── Tryby ──────────────────────────────────────────────────────────────────

describe("rozpoznanie trybu", () => {
  it("brak EMAIL_MODE to tryb live", () => {
    expect(resolveMailMode({})).toBe("live")
  })

  it("nieznana wartość to także live, nie test", () => {
    expect(resolveMailMode({ EMAIL_MODE: "staging" })).toBe("live")
    expect(resolveMailMode({ EMAIL_MODE: "TEST" })).toBe("live")
  })

  it("mock i test rozpoznawane dokładnie", () => {
    expect(resolveMailMode({ EMAIL_MODE: "mock" })).toBe("mock")
    expect(resolveMailMode({ EMAIL_MODE: "test" })).toBe("test")
  })
})

// ─── Produkcja bez zmian ────────────────────────────────────────────────────

describe("tryb live — poczta produkcyjna niezmieniona", () => {
  const env = {}

  it("adresat przechodzi nietknięty", () => {
    const out = applyRecipientPolicy({ ...BASE, to: CUSTOMER }, env)
    expect(out.to).toBe(CUSTOMER)
  })

  it("cc i bcc przechodzą bez ingerencji", () => {
    const params = { ...BASE, to: CUSTOMER, cc: "a@example.com", bcc: ["b@example.com"] }
    expect(applyRecipientPolicy(params, env)).toEqual(params)
  })

  it("nie dokłada nagłówka X-Staging-Original-To", () => {
    const out = applyRecipientPolicy({ ...BASE, to: CUSTOMER }, env)
    expect(out).not.toHaveProperty("headers")
  })

  it("obiekt wyjściowy jest tą samą referencją — zero narzutu", () => {
    const params = { ...BASE, to: CUSTOMER }
    expect(applyRecipientPolicy(params, env)).toBe(params)
  })
})

describe("tryb mock — nic nie opuszcza procesu", () => {
  it("adresat nie jest nadpisywany, bo nie ma dostawy", () => {
    const out = applyRecipientPolicy({ ...BASE, to: CUSTOMER }, { EMAIL_MODE: "mock" })
    expect(out.to).toBe(CUSTOMER)
  })
})

// ─── Tryb test: jedyny dozwolony adresat ────────────────────────────────────

describe("tryb test — wyłącznie RESERVATION_TEST_EMAIL", () => {
  const env = { EMAIL_MODE: "test", RESERVATION_TEST_EMAIL: TESTER }

  it("adres klienta z formularza NIGDY nie jest używany", () => {
    const out = applyRecipientPolicy({ ...BASE, to: CUSTOMER }, env)
    expect(out.to).toBe(TESTER)
    expect(JSON.stringify(out.to)).not.toContain(CUSTOMER)
  })

  it("wiadomość do właściciela też jest przekierowana", () => {
    const out = applyRecipientPolicy({ ...BASE, to: OWNER }, { ...env, MAIL_TO_OWNER: OWNER })
    expect(out.to).toBe(TESTER)
  })

  it("lista wielu adresatów zwija się do jednego testowego", () => {
    const out = applyRecipientPolicy({ ...BASE, to: [CUSTOMER, OWNER, "trzeci@example.com"] }, env)
    expect(out.to).toBe(TESTER)
  })

  it("adres w postaci 'Nazwa <adres>' jest akceptowany", () => {
    const out = applyRecipientPolicy(
      { ...BASE, to: `Klient <${CUSTOMER}>` },
      { EMAIL_MODE: "test", RESERVATION_TEST_EMAIL: `Tester <${TESTER}>` },
    )
    expect(out.to).toBe(`Tester <${TESTER}>`)
  })

  it("pierwotny adresat jedzie w nagłówku, nie w treści", () => {
    const out: Record<string, unknown> = applyRecipientPolicy({ ...BASE, to: CUSTOMER }, env)
    expect((out.headers as Record<string, string>)["X-Staging-Original-To"]).toBe(CUSTOMER)
    expect(out.subject).toBe(BASE.subject)
    expect(out.text).toBe(BASE.text)
  })

  it("istniejące nagłówki są zachowane", () => {
    const out = applyRecipientPolicy(
      { ...BASE, to: CUSTOMER, headers: { "X-Entity-Ref-ID": "abc" } },
      env,
    )
    const headers = out.headers as Record<string, string>
    expect(headers["X-Entity-Ref-ID"]).toBe("abc")
    expect(headers["X-Staging-Original-To"]).toBe(CUSTOMER)
  })
})

// ─── Tryb test: odrzucenia ──────────────────────────────────────────────────

describe("tryb test — odrzucanie niedozwolonych adresatów", () => {
  const env = { EMAIL_MODE: "test", RESERVATION_TEST_EMAIL: TESTER }

  it("cc jest odrzucane, nie wyciszane", () => {
    expect(() => applyRecipientPolicy({ ...BASE, to: TESTER, cc: CUSTOMER }, env)).toThrow(
      MailPolicyError,
    )
  })

  it("bcc jest odrzucane", () => {
    expect(() => applyRecipientPolicy({ ...BASE, to: TESTER, bcc: [CUSTOMER] }, env)).toThrow(
      MailPolicyError,
    )
  })

  it("puste cc/bcc nie przeszkadza", () => {
    const out = applyRecipientPolicy({ ...BASE, to: CUSTOMER, cc: [], bcc: "" }, env)
    expect(out.to).toBe(TESTER)
    expect(out).not.toHaveProperty("cc")
    expect(out).not.toHaveProperty("bcc")
  })

  it("brak RESERVATION_TEST_EMAIL zatrzymuje wysyłkę — bez odwrotu do klienta", () => {
    expect(() => applyRecipientPolicy({ ...BASE, to: CUSTOMER }, { EMAIL_MODE: "test" })).toThrow(
      /RESERVATION_TEST_EMAIL/,
    )
  })

  it("pusty RESERVATION_TEST_EMAIL też zatrzymuje", () => {
    expect(() =>
      applyRecipientPolicy({ ...BASE, to: CUSTOMER }, { EMAIL_MODE: "test", RESERVATION_TEST_EMAIL: "   " }),
    ).toThrow(MailPolicyError)
  })

  it("nieobsługiwany format adresata jest odrzucany", () => {
    expect(() => applyRecipientPolicy({ ...BASE, to: { address: CUSTOMER } as never }, env)).toThrow(
      MailPolicyError,
    )
  })
})

// ─── Wymuszenie w transporcie ───────────────────────────────────────────────

describe("transport wymusza politykę niezależnie od wywołującego", () => {
  it("surowy adres klienta — scenariusz z /api/inquiries/occasional — jest przekierowany", async () => {
    process.env.EMAIL_MODE = "test"
    process.env.RESERVATION_TEST_EMAIL = TESTER

    const { sent, guarded } = stubClient()
    // Wywołujący NIE używa effectiveTo — dokładnie jak w zepsutej ścieżce.
    await guarded.emails.send({ ...BASE, to: CUSTOMER } as never)

    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe(TESTER)
  })

  it("transport przepuszcza bez zmian w trybie live", async () => {
    const { sent, guarded } = stubClient()
    await guarded.emails.send({ ...BASE, to: CUSTOMER } as never)
    expect(sent[0].to).toBe(CUSTOMER)
  })

  it("transport odrzuca cc w trybie test i nic nie wysyła", async () => {
    process.env.EMAIL_MODE = "test"
    process.env.RESERVATION_TEST_EMAIL = TESTER

    const { sent, guarded } = stubClient()
    await expect(guarded.emails.send({ ...BASE, to: TESTER, cc: CUSTOMER } as never)).rejects.toThrow(
      MailPolicyError,
    )
    expect(sent).toHaveLength(0)
  })

  it("transport nie wysyła nic, gdy brakuje adresu testowego", async () => {
    process.env.EMAIL_MODE = "test"

    const { sent, guarded } = stubClient()
    await expect(guarded.emails.send({ ...BASE, to: CUSTOMER } as never)).rejects.toThrow(
      /RESERVATION_TEST_EMAIL/,
    )
    expect(sent).toHaveLength(0)
  })

  it("pozostałe metody klienta nie są przesłonięte", () => {
    const { guarded } = stubClient()
    expect(typeof guarded.emails.send).toBe("function")
    expect(guarded.emails).toBeDefined()
  })
})

// ─── effectiveTo: koniec fail-open ──────────────────────────────────────────

describe("effectiveTo", () => {
  it("w trybie live zwraca adres rzeczywisty", () => {
    expect(effectiveTo(CUSTOMER)).toBe(CUSTOMER)
  })

  it("w trybie test zwraca adres testowy", () => {
    process.env.EMAIL_MODE = "test"
    process.env.RESERVATION_TEST_EMAIL = TESTER
    expect(effectiveTo(CUSTOMER)).toBe(TESTER)
  })

  it("w trybie test bez adresu testowego RZUCA, zamiast zwrócić adres klienta", () => {
    process.env.EMAIL_MODE = "test"
    expect(() => effectiveTo(CUSTOMER)).toThrow(MailPolicyError)
  })
})

// ─── Pomocniki ──────────────────────────────────────────────────────────────

describe("pomocniki adresowe", () => {
  it("extractAddress wyciąga adres z nawiasów i normalizuje wielkość liter", () => {
    expect(extractAddress("Tester <Foo@Example.COM>")).toBe("foo@example.com")
    expect(extractAddress("  Foo@Example.com ")).toBe("foo@example.com")
  })

  it("normalizeRecipients obsługuje tekst, listę i wartości puste", () => {
    expect(normalizeRecipients(undefined)).toEqual([])
    expect(normalizeRecipients("")).toEqual([])
    expect(normalizeRecipients("a@x.pl, b@x.pl")).toEqual(["a@x.pl", "b@x.pl"])
    expect(normalizeRecipients(["a@x.pl", "b@x.pl"])).toEqual(["a@x.pl", "b@x.pl"])
  })

  it("requireTestRecipient rzuca przy braku wartości", () => {
    expect(() => requireTestRecipient({})).toThrow(MailPolicyError)
    expect(requireTestRecipient({ RESERVATION_TEST_EMAIL: TESTER })).toBe(TESTER)
  })
})
