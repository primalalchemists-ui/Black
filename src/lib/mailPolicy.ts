/**
 * Polityka adresatów poczty.
 *
 * Powód istnienia: dotąd przekierowanie na adres testowy opierało się na
 * KONWENCJI — każdy punkt wysyłki musiał pamiętać o wywołaniu `effectiveTo()`.
 * Audyt pokazał, że konwencja zawiodła: `/api/inquiries/occasional` wysyłał
 * `to: v.email`, czyli adres wpisany w formularzu, bez żadnego przekierowania.
 * Na stagingu oznaczałoby to prawdziwą wiadomość do losowej osoby.
 *
 * Dlatego polityka jest wymuszana w TRANSPORCIE (`getMailClient`), a nie
 * u wywołujących. Pominięcie jej wymagałoby obejścia klienta poczty.
 *
 * ── TRYBY ────────────────────────────────────────────────────────────────────
 *
 * • `live`  — EMAIL_MODE nieustawione lub inne niż poniższe. Polityka jest
 *             przelotką: nie zmienia niczego. Produkcja działa jak dotąd.
 * • `test`  — rzeczywista dostawa, ale WYŁĄCZNIE na RESERVATION_TEST_EMAIL.
 * • `mock`  — nic nie opuszcza procesu, więc logujemy prawdziwych adresatów;
 *             to ułatwia pracę lokalną i nie da się tym nikomu nic wysłać.
 *
 * ── REGUŁY TRYBU `test` ──────────────────────────────────────────────────────
 *
 * 1. Brak RESERVATION_TEST_EMAIL → błąd. Nigdy nie ma odwrotu do adresu
 *    klienta; fail closed, bo wysłanie czegokolwiek do klienta jest gorsze
 *    niż niewysłanie niczego.
 * 2. `to` jest NADPISYWANE adresem testowym — także dla wiadomości do
 *    właściciela.
 * 3. `cc` i `bcc` są ODRZUCANE, nie wyciszane. Dziś żaden punkt wysyłki ich
 *    nie używa (sprawdzone), więc ich pojawienie się to błąd programisty
 *    i ma się zgłosić, a nie przejść niezauważenie.
 * 4. Po nadpisaniu zbiór odbiorców jest WERYFIKOWANY. Gdyby reguła 2 kiedyś
 *    przestała wystarczać, ten warunek i tak zatrzyma wysyłkę.
 *
 * Treść i temat pozostają nietknięte — mają wyglądać dokładnie tak jak na
 * produkcji. Pierwotny adresat jedzie w nagłówku `X-Staging-Original-To`,
 * żeby dało się go odczytać w źródle wiadomości.
 */

export type MailMode = "mock" | "test" | "live"

export type MailEnv = {
  EMAIL_MODE?: string
  RESERVATION_TEST_EMAIL?: string
  MAIL_TO_OWNER?: string
  [key: string]: string | undefined
}

export class MailPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MailPolicyError"
  }
}

export function resolveMailMode(env: MailEnv = process.env): MailMode {
  if (env.EMAIL_MODE === "mock") return "mock"
  if (env.EMAIL_MODE === "test") return "test"
  return "live"
}

/** Adres testowy. Rzuca, gdy tryb `test` jest włączony bez niego. */
export function requireTestRecipient(env: MailEnv = process.env): string {
  const raw = env.RESERVATION_TEST_EMAIL?.trim()
  if (!raw) {
    throw new MailPolicyError(
      "EMAIL_MODE=test, ale RESERVATION_TEST_EMAIL nie jest ustawione. " +
        "Wysyłka wstrzymana — nie ma dokąd bezpiecznie dostarczyć wiadomości.",
    )
  }
  return raw
}

/** Wyciąga sam adres z zapisu `Nazwa <adres>` albo zwraca wejście. */
export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>\s*$/)
  return (match ? match[1] : value).trim().toLowerCase()
}

/** Sprowadza pole adresowe Resenda do listy adresów. */
export function normalizeRecipients(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === "string") {
    return value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeRecipients(item))
  }
  throw new MailPolicyError(
    `Nieobsługiwany format adresata (${typeof value}). Oczekiwano tekstu lub tablicy tekstów.`,
  )
}

type SendParams = Record<string, unknown>

/**
 * Zwraca parametry wysyłki dopuszczone przez politykę albo rzuca.
 * Czysta funkcja — nie czyta `process.env` poza wartością domyślną.
 */
export function applyRecipientPolicy<T extends SendParams>(params: T, env: MailEnv = process.env): T {
  if (resolveMailMode(env) !== "test") return params

  const testRecipient = requireTestRecipient(env)
  const allowed = extractAddress(testRecipient)

  for (const field of ["cc", "bcc"] as const) {
    if (normalizeRecipients(params[field]).length > 0) {
      throw new MailPolicyError(
        `EMAIL_MODE=test odrzuca pole "${field}". W trybie testowym dozwolony jest ` +
          `wyłącznie jeden adresat w "to". Usuń "${field}" z wywołania.`,
      )
    }
  }

  const original = normalizeRecipients(params.to)

  const next: SendParams = { ...params, to: testRecipient }
  delete next.cc
  delete next.bcc

  if (original.length > 0) {
    const existingHeaders =
      typeof params.headers === "object" && params.headers !== null
        ? (params.headers as Record<string, string>)
        : {}
    next.headers = { ...existingHeaders, "X-Staging-Original-To": original.join(", ") }
  }

  // Kontrola końcowa — niezależna od powyższego nadpisania.
  const finalSet = [
    ...normalizeRecipients(next.to),
    ...normalizeRecipients(next.cc),
    ...normalizeRecipients(next.bcc),
  ].map(extractAddress)

  if (finalSet.length !== 1 || finalSet[0] !== allowed) {
    throw new MailPolicyError(
      `Kontrola końcowa odrzuciła wysyłkę: adresaci po zastosowaniu polityki to ` +
        `[${finalSet.join(", ")}], a dozwolony jest wyłącznie [${allowed}].`,
    )
  }

  return next as T
}

/** Opis przekierowania do logu. Nie zawiera treści wiadomości. */
export function describeRedirect(params: SendParams, env: MailEnv = process.env): string | null {
  if (resolveMailMode(env) !== "test") return null
  const original = normalizeRecipients(params.to).join(", ")
  const target = env.RESERVATION_TEST_EMAIL?.trim() ?? "?"
  return `[EMAIL_MODE=test] przekierowano ${original || "(brak)"} → ${target}`
}
