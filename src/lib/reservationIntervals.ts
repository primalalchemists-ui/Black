/**
 * Jedno źródło prawdy dla rekonstrukcji interwałów czasowych segmentów rezerwacji.
 *
 * ── PROBLEM, KTÓRY TO ROZWIĄZUJE ──────────────────────────────────────────────
 *
 * `reservations.segments[]` przechowuje WYŁĄCZNIE czas zegarowy
 * (`startHour`/`startMinute`/`endHour`/`endMinute`) — bez informacji o dniu.
 *
 * Rezerwacja 23:00–00:00 jest zapisywana poprawnie jako absolutne instanty
 * (`startsAt` = 23:00 dnia D, `endsAt` = 00:00 dnia D+1), ale segment dostaje
 * `endHour = endsAt.getHours()` = **0**. Przy odtwarzaniu naiwnym
 * `toDateAtHourMinute(day, 0, 0)` koniec trafiał na północ na POCZĄTKU dnia D,
 * czyli PRZED początkiem segmentu. Powstawał interwał o ujemnej długości,
 * dla którego `overlaps()` zwraca false dla każdego slotu — tor wyglądał na
 * wolny, mimo istniejącej rezerwacji (ryzyko double-bookingu).
 *
 * ── KONWENCJA ─────────────────────────────────────────────────────────────────
 *
 * Koniec segmentu jest EKSKLUZYWNY. Jeśli czas zegarowy końca jest mniejszy lub
 * równy czasowi początku, koniec należy do NASTĘPNEGO dnia kalendarzowego.
 *
 * To dokładnie ta sama reguła, którą projekt stosuje już dla wydarzeń
 * blokujących lokal (`isSlotBlockedByVenueEvent` w `src/lib/openingHours.ts`)
 * oraz dla pól top-level w `Reservations.beforeValidate` ("overnight event —
 * push end to next day"). Nie wprowadzamy nowej konwencji, tylko domykamy ją
 * tam, gdzie jej brakowało.
 *
 * ── DLACZEGO OFFSET DNIA, A NIE ARYTMETYKA MILISEKUND ─────────────────────────
 *
 * Zwracamy przesunięcie dnia i budujemy datę konstruktorem `Date`, a nie przez
 * dodawanie milisekund. Konstruktor rozwiązuje czas zegarowy na instant
 * z uwzględnieniem zmiany czasu (DST), więc godzina 23:00 pozostaje godziną
 * 23:00 także w dobę przestawienia zegarów. Dodawanie 3600000 ms dałoby wtedy
 * przesunięcie o godzinę.
 *
 * Dla przypadków nieprzechodzących przez północ wynik jest identyczny
 * z poprzednią implementacją — bit w bit — więc zachowanie zwykłych rezerwacji
 * nie zmienia się w żadnym stopniu.
 */

export const MINUTES_PER_DAY = 24 * 60

export type SegmentTime = {
  startHour?: unknown
  startMinute?: unknown
  endHour?: unknown
  endMinute?: unknown
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Czas zegarowy wyrażony w minutach od północy. */
export function wallMinutes(hour: unknown, minute: unknown): number {
  return toNum(hour) * 60 + toNum(minute)
}

/**
 * Czy koniec segmentu wypada następnego dnia?
 *
 * 0 → koniec tego samego dnia kalendarzowego (np. 18:00–20:00)
 * 1 → koniec następnego dnia kalendarzowego (np. 23:00–00:00, 22:00–02:00)
 */
export function segmentEndDayOffset(seg: SegmentTime): 0 | 1 {
  const startMins = wallMinutes(seg.startHour, seg.startMinute)
  const endMins = wallMinutes(seg.endHour, seg.endMinute)
  return endMins <= startMins ? 1 : 0
}

/** Rozkłada dzień na komponenty w czasie LOKALNYM (jak `toDateAtHourMinute`). */
function localDayParts(day: string | Date): { y: number; m: number; d: number } {
  if (typeof day === "string") {
    const [y, m, d] = day.split("-").map((x) => Number(x))
    return { y, m: (m ?? 1) - 1, d: d ?? 1 }
  }
  return { y: day.getFullYear(), m: day.getMonth(), d: day.getDate() }
}

/** Rozkłada dzień na komponenty w UTC (jak `segToDate` w kolekcji Reservations). */
function utcDayParts(day: string | Date): { y: number; m: number; d: number } {
  const base = day instanceof Date ? day : new Date(day)
  return { y: base.getUTCFullYear(), m: base.getUTCMonth(), d: base.getUTCDate() }
}

/**
 * Interwał segmentu w czasie lokalnym serwera — baza używana przez
 * endpointy `/api/reservations/{kregle,bilard}`.
 *
 * Gwarancja: `end > start` zawsze. Interwał nigdy nie jest odwrócony.
 */
export function localSegmentInterval(
  day: string | Date,
  seg: SegmentTime,
): { start: Date; end: Date } {
  const { y, m, d } = localDayParts(day)
  const offset = segmentEndDayOffset(seg)

  return {
    start: new Date(y, m, d, toNum(seg.startHour), toNum(seg.startMinute), 0, 0),
    end: new Date(y, m, d + offset, toNum(seg.endHour), toNum(seg.endMinute), 0, 0),
  }
}

/**
 * Interwał segmentu w UTC — baza używana przez hook `beforeChange`
 * w kolekcji `Reservations` (panel administratora).
 *
 * Gwarancja: `end > start` zawsze.
 */
export function utcSegmentInterval(
  day: string | Date,
  seg: SegmentTime,
): { start: Date; end: Date } {
  const { y, m, d } = utcDayParts(day)
  const offset = segmentEndDayOffset(seg)

  return {
    start: new Date(Date.UTC(y, m, d, toNum(seg.startHour), toNum(seg.startMinute), 0, 0)),
    end: new Date(Date.UTC(y, m, d + offset, toNum(seg.endHour), toNum(seg.endMinute), 0, 0)),
  }
}
