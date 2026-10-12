/**
 * Rozpoznawanie kolizji terminów.
 *
 * ── DLACZEGO TO ISTNIEJE ─────────────────────────────────────────────────────
 *
 * Hooki kolekcji `reservations` rzucają zwykły `Error` z polskim komunikatem,
 * np. „Wystąpiła kolizja z inną rezerwacją w tym terminie.". Trasy mapowały na
 * 409 tylko dwa wzorce:
 *
 *     msg.includes("zarezerwowany w tym czasie") || msg.startsWith("Kolizja")
 *
 * Komunikat z hooka nie pasował do żadnego z nich, więc wyścig o ten sam slot
 * kończył się dla klienta **HTTP 500** zamiast czytelnego 409. Zweryfikowane
 * testem: handler logował „nieoczekiwany błąd: Wystąpiła kolizja…".
 *
 * Dopasowanie jest tu w jednym miejscu, wspólne dla wszystkich tras, i objęte
 * testami. Celowo rozpoznajemy po treści, a nie po klasie wyjątku: hooki
 * rzucają `Error`, a przepisanie ich na typowany wyjątek zmieniałoby logikę
 * rezerwacji, czego ta zmiana nie dotyczy.
 */

/** Fragmenty komunikatów oznaczające zajęty termin, nie awarię. */
const CONFLICT_PATTERNS = [
  // hooki kolekcji `reservations` (rezerwacja i blokada dostępności)
  "kolizja",
  // starsze komunikaty z tras
  "zarezerwowany w tym czasie",
  "są już zajęte w tym terminie",
  "jest już zajęty w tym terminie",
] as const

export function messageIndicatesConflict(message: string): boolean {
  const m = message.toLowerCase()
  return CONFLICT_PATTERNS.some((p) => m.includes(p))
}

/**
 * Czy błąd oznacza zajęty termin.
 *
 * Zwraca `false` dla czegokolwiek, czego nie rozpoznajemy — nieznany błąd ma
 * zostać zgłoszony jako 500, a nie udawać konfliktu rezerwacji.
 */
export function isBookingConflictError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : typeof (err as { message?: unknown } | null)?.message === "string"
          ? String((err as { message: string }).message)
          : ""

  if (!message) return false
  return messageIndicatesConflict(message)
}

/** Komunikat dla klienta przy zajętym terminie. */
export function conflictResponseMessage(kind: "kregle" | "bilard" | "stolik"): string {
  if (kind === "bilard") {
    return "Wybrany stół jest już zajęty w tym terminie. Odśwież stronę i wybierz inny czas."
  }
  if (kind === "stolik") {
    return "Wybrany termin jest już zajęty. Odśwież stronę i wybierz inny czas."
  }
  return "Wybrany tor jest już zajęty w tym terminie. Odśwież stronę i wybierz inny czas."
}
