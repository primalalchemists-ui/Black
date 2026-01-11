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
