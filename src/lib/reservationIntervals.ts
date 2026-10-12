/**
 * Jedno źródło prawdy dla rekonstrukcji interwałów czasowych rezerwacji
 * i blokad dostępności (blackoutów).
 *
 * ── PROBLEM, KTÓRY TO ROZWIĄZUJE ──────────────────────────────────────────────
 *
 * `reservations.segments[]` oraz `blackouts` przechowują WYŁĄCZNIE czas zegarowy
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
 * ── TRZY STANY, NIE DWA ───────────────────────────────────────────────────────
 *
 * Koniec interwału jest EKSKLUZYWNY. Rozróżniamy:
 *
 *   end >  start  → `same_day`      — zwykły interwał w obrębie dnia
 *   end <  start  → `overnight`     — koniec należy do NASTĘPNEGO dnia
 *                                     (w szczególności koniec o 00:00)
 *   end == start  → `zero_duration` — WEJŚCIE NIEPRAWIDŁOWE, nie interwał 24 h
 *
 * Rozdzielenie `overnight` od `zero_duration` jest istotne: wcześniejsza wersja
 * tej biblioteki traktowała `end <= start` jednolicie jako przejście przez
 * północ, co zamieniało błędne wejście 18:00–18:00 w zaakceptowaną rezerwację
 * 24-godzinną. Zero-duration nigdy nie jest rolowane na następny dzień.
 *
 * ── DLACZEGO OFFSET DNIA, A NIE ARYTMETYKA MILISEKUND ─────────────────────────
 *
 * Zwracamy przesunięcie dnia i budujemy datę konstruktorem `Date`, a nie przez
 * dodawanie milisekund. Konstruktor rozwiązuje czas zegarowy na instant
 * z uwzględnieniem zmiany czasu (DST), więc godzina 23:00 pozostaje godziną
 * 23:00 także w dobę przestawienia zegarów. Dodawanie 3600000 ms dałoby wtedy
 * przesunięcie o godzinę.
 *
 * Dla przypadków `same_day` wynik jest identyczny z poprzednią implementacją —
 * bit w bit — więc zachowanie zwykłych rezerwacji nie zmienia się w żadnym
 * stopniu.
 */

export const MINUTES_PER_DAY = 24 * 60

export type SegmentTime = {
  startHour?: unknown
  startMinute?: unknown
  endHour?: unknown
  endMinute?: unknown
}

export type BlackoutTime = SegmentTime & {
  allDay?: unknown
}

export type IntervalKind = "same_day" | "overnight" | "zero_duration"

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Zwraca liczbę tylko gdy jest skończona — inaczej null (wejście nieprawidłowe). */
function finiteOrNull(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Czas zegarowy wyrażony w minutach od północy. */
export function wallMinutes(hour: unknown, minute: unknown): number {
  return toNum(hour) * 60 + toNum(minute)
}

/**
 * Klasyfikacja interwału na podstawie samego czasu zegarowego.
 *
 * To jest kanoniczna reguła projektu — ta sama, którą stosuje
 * `isSlotBlockedByVenueEvent` w `src/lib/openingHours.ts` dla wydarzeń
 * blokujących lokal oraz `Reservations.beforeValidate` dla pól top-level.
 */
export function intervalKind(t: SegmentTime): IntervalKind {
  const startMins = wallMinutes(t.startHour, t.startMinute)
  const endMins = wallMinutes(t.endHour, t.endMinute)

  if (endMins > startMins) return "same_day"
  if (endMins === startMins) return "zero_duration"
  return "overnight"
}

/** Czy wejście jest zerowej długości (nieprawidłowe)? */
export function isZeroDuration(t: SegmentTime): boolean {
  return intervalKind(t) === "zero_duration"
}

/**
 * Przesunięcie dnia dla końca interwału.
 *
 * 1 → tylko dla `overnight` (np. 23:00–00:00, 22:00–02:00)
 * 0 → dla `same_day` ORAZ dla `zero_duration`
 *
 * Zero-duration NIE jest rolowane — inaczej 18:00–18:00 stałoby się
 * rezerwacją 24-godzinną.
 */
export function segmentEndDayOffset(t: SegmentTime): 0 | 1 {
  return intervalKind(t) === "overnight" ? 1 : 0
}

/** Rozkłada dzień na komponenty w czasie LOKALNYM (jak `toDateAtHourMinute`). */
function localDayParts(day: string | Date): { y: number; m: number; d: number } {
  if (typeof day === "string") {
    const [y, m, d] = day.split("-").map((x) => Number(x))
    return { y, m: (m ?? 1) - 1, d: d ?? 1 }
  }
  return { y: day.getFullYear(), m: day.getMonth(), d: day.getDate() }
}

/** Rozkłada dzień na komponenty w UTC (jak dawne `segToDate` w kolekcji). */
function utcDayParts(day: string | Date): { y: number; m: number; d: number } {
  const base = day instanceof Date ? day : new Date(day)
  return { y: base.getUTCFullYear(), m: base.getUTCMonth(), d: base.getUTCDate() }
}

/**
 * Interwał segmentu rezerwacji w czasie lokalnym serwera — baza używana przez
 * endpointy `/api/reservations/{kregle,bilard}`.
 *
 * Dla `zero_duration` zwraca interwał o zerowej długości (`start === end`),
 * który `overlaps()` traktuje jako brak nakładania. Taki rekord nie powinien
 * istnieć — powstanie nowego blokuje walidacja w `Reservations` — a dla
 * ewentualnych rekordów historycznych świadomie NIE blokujemy 24 godzin.
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
 * Interwał segmentu rezerwacji w UTC — baza używana przez hook `beforeChange`
 * w kolekcji `Reservations` (panel administratora).
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

/**
 * Wspólna walidacja wejścia blackoutu. Zwraca znormalizowane minuty
 * albo null, jeśli blackoutu nie wolno brać pod uwagę.
 *
 * Kontrakt `null` jest celowo taki sam jak w dotychczasowych implementacjach
 * `blackoutRange` (`if (end <= start) return null`), ale ZAWĘŻONY: odrzucamy
 * tylko wejście faktycznie nieprawidłowe (NaN, zerowa długość), a nie
 * poprawny blackout kończący się o północy.
 */
function blackoutParts(
  b: BlackoutTime,
): { startHour: number; startMinute: number; endHour: number; endMinute: number; offset: 0 | 1 } | null {
  const sh = finiteOrNull(b.startHour)
  const eh = finiteOrNull(b.endHour)
  if (sh === null || eh === null) return null

  const sm = toNum(b.startMinute, 0)
  const em = toNum(b.endMinute, 0)

  const t = { startHour: sh, startMinute: sm, endHour: eh, endMinute: em }
  if (intervalKind(t) === "zero_duration") return null

  return { ...t, offset: segmentEndDayOffset(t) }
}

/**
 * Zakres blackoutu w czasie lokalnym serwera — dla endpointów
 * `/api/reservations/{kregle,bilard}` i `/api/reservations/availability`.
 *
 * Zwraca `null`, gdy blackout nie ma być uwzględniony (nieprawidłowe godziny
 * albo zerowa długość). Zachowuje dotychczasową semantykę `allDay`:
 * od 00:00:00.000 do 23:59:59.999 tego samego dnia.
 */
export function localBlackoutRange(
  day: string | Date,
  b: BlackoutTime,
): { s: Date; e: Date } | null {
  const { y, m, d } = localDayParts(day)

  if (b.allDay) {
    return {
      s: new Date(y, m, d, 0, 0, 0, 0),
      e: new Date(y, m, d, 23, 59, 59, 999),
    }
  }

  const parts = blackoutParts(b)
  if (!parts) return null

  return {
    s: new Date(y, m, d, parts.startHour, parts.startMinute, 0, 0),
    e: new Date(y, m, d + parts.offset, parts.endHour, parts.endMinute, 0, 0),
  }
}

/**
 * Zakres blackoutu w UTC — dla hooków kolekcji `Reservations` i `Blackouts`.
 */
export function utcBlackoutRange(
  day: string | Date,
  b: BlackoutTime,
): { s: Date; e: Date } | null {
  const { y, m, d } = utcDayParts(day)

  if (b.allDay) {
    return {
      s: new Date(Date.UTC(y, m, d, 0, 0, 0, 0)),
      e: new Date(Date.UTC(y, m, d, 23, 59, 59, 999)),
    }
  }

  const parts = blackoutParts(b)
  if (!parts) return null

  return {
    s: new Date(Date.UTC(y, m, d, parts.startHour, parts.startMinute, 0, 0)),
    e: new Date(Date.UTC(y, m, d + parts.offset, parts.endHour, parts.endMinute, 0, 0)),
  }
}
