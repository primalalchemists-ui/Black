/**
 * Wycena rezerwacji po stronie serwera.
 *
 * ── DLACZEGO TO ISTNIEJE ─────────────────────────────────────────────────────
 *
 * Trasy kręgli i bilarda mają dwie ścieżki. Ta używana przez frontend wysyła
 * `segments` i liczy kwotę z `reservation-settings`. Starsza, z płaskim
 * `resources` + `totalPrice`, brała kwotę WPROST Z ŻĄDANIA:
 *
 *     const amountToPay = data.totalPrice ?? 0
 *
 * a z kwoty wynikał `paymentStatus`. Żądanie z `totalPrice: 0` dawało więc
 * rezerwację ze statusem `not_required` — darmowy tor albo stół. Ścieżka była
 * publicznie osiągalna, więc wystarczyło ominąć formularz.
 *
 * Kwota jest teraz zawsze wyliczana tutaj, z danych serwera. Wartość z żądania
 * nie wpływa na to, ile trzeba zapłacić.
 */

const MS_PER_HOUR = 3_600_000

/** Długość rezerwacji w godzinach. `endsAt` jest wyłączne. */
export function durationHours(startsAt: Date, endsAt: Date): number {
  const ms = endsAt.getTime() - startsAt.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / MS_PER_HOUR
}

export type AmountInput = {
  startsAt: Date
  endsAt: Date
  /** Ile zasobów obejmuje rezerwacja — cennik jest za godzinę każdego z nich. */
  resourceCount: number
  pricePerHour: number
}

/**
 * Kwota do zapłaty, licząc tak samo jak ścieżka `segments`: iloczyn godzin,
 * liczby zasobów i stawki godzinowej. Nigdy nie zwraca wartości ujemnej.
 */
export function serverAmountToPay({
  startsAt,
  endsAt,
  resourceCount,
  pricePerHour,
}: AmountInput): number {
  const hours = durationHours(startsAt, endsAt)
  const count = Number.isFinite(resourceCount) ? Math.max(0, Math.trunc(resourceCount)) : 0
  const rate = Number.isFinite(pricePerHour) ? Math.max(0, pricePerHour) : 0

  const amount = hours * count * rate
  if (!Number.isFinite(amount) || amount <= 0) return 0

  // Grosze: unikamy wartości w rodzaju 119.99999999999999.
  return Math.round(amount * 100) / 100
}
