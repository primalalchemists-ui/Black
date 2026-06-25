// app/api/reservations/_shared.ts

// ✅ obsługuje też floaty, np. 16.5 => 16:30
export function toDateAtHour(day: string, hour: number) {
  const [y, m, d] = day.split("-").map((x) => Number(x));

  const h = Math.trunc(hour);
  const frac = hour - h;
  const minute = Math.round(frac * 60);

  return new Date(y, (m ?? 1) - 1, d ?? 1, h, minute, 0, 0);
}

export function toDateAtHourMinute(day: string, hour: number, minute: number) {
  const [y, m, d] = day.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, hour, minute, 0, 0);
}

export function startOfDay(day: string) {
  const [y, m, d] = day.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function endOfDay(day: string) {
  const [y, m, d] = day.split("-").map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

// "16:30" -> 16.5
export function hourFloatFromHHMM(hhmm: string) {
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const h = Number.isFinite(hh) ? hh : 0;
  const m = Number.isFinite(mm) ? mm : 0;
  return h + m / 60;
}

export function resourceTypeForReservation(type: string) {
  if (type === "bilard") return "billiard";
  if (type === "kregle") return "lane";
  return null;
}

export function mapServiceForBlackout(type: string) {
  if (type === "bilard") return "billiard";
  if (type === "kregle") return "bowling";
  return null;
}

export function startOfLocalDayISO(d: Date) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0); // 12:00 lokalnie => brak przesunięć dnia przez UTC
  return x.toISOString();
}

/**
 * Aktualny czas w strefie Europe/Warsaw.
 * Niezależny od strefy serwera (Railway = UTC).
 */
export function getNowInWarsaw(): { dateStr: string; h: number; m: number; totalMinutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const h = Number(get("hour")) % 24; // niektóre locale dają "24" o północy
  const m = Number(get("minute"));

  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    h,
    m,
    totalMinutes: h * 60 + m,
  };
}

/**
 * Czy slot (date + hour:minute w Warsaw) jest jeszcze do zarezerwowania?
 * Zwraca false dla minionych dni oraz slotów zaczynających się
 * za mniej niż leadMinutes minut (domyślnie 15).
 */
export function isSlotBookableWithLeadTime(
  date: string,
  slotHour: number,
  slotMinute: number,
  leadMinutes = 15,
): boolean {
  const now = getNowInWarsaw();
  if (date < now.dateStr) return false; // miniony dzień
  if (date > now.dateStr) return true;  // przyszły dzień
  // dzisiaj w Warsaw
  return slotHour * 60 + slotMinute >= now.totalMinutes + leadMinutes;
}
