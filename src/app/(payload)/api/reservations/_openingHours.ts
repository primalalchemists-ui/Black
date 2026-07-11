// app/api/reservations/_openingHours.ts

export type OpeningHour = {
  key: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string;  // "16:00"
  close: string; // "22:00" lub "00:00" (po północy)
  label?: string;
};

function parseHHMM(timeStr: string) {
  const [h, m] = String(timeStr || "")
    .split(":")
    .map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function minutesFromHHMM(timeStr: string) {
  const p = parseHHMM(timeStr);
  if (!p) return null;
  return p.h * 60 + p.m;
}

function hhmmFromMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weekdayKeyFromDate(dateStr: string): OpeningHour["key"] {
  // stabilne dla YYYY-MM-DD
  const d = new Date(dateStr + "T00:00:00.000Z");
  const map: OpeningHour["key"][] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[d.getUTCDay()];
}

// close może być 00:00 -> traktujemy jako następny dzień
function resolveOpenCloseMinutes(oh: OpeningHour) {
  const openM = minutesFromHHMM(oh.open);
  let closeM = minutesFromHHMM(oh.close);

  if (openM == null || closeM == null) return null;

  if (closeM <= openM) closeM += 24 * 60; // po północy
  return { openM, closeM };
}

// ✅ TO JEST KLUCZ: identyczne jak w stolikach
export async function getOpeningHours(payload: any): Promise<OpeningHour[]> {
  try {
    const g = await payload.findGlobal({ slug: "site-settings" });
    if (Array.isArray(g?.openingHours)) return g.openingHours as OpeningHour[];
  } catch {}
  return [];
}

export function addMinutes(d: Date, minutes: number) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + minutes);
  return x;
}

/**
 * Zwraca true gdy dzień jest w konfiguracji i ma open=false/""/"false".
 * false gdy dnia nie ma w konfiguracji (wtedy używamy fallbacku 16-22).
 */
export function isDayClosed(date: string, openingHours: OpeningHour[]): boolean {
  const dayKey = weekdayKeyFromDate(date);
  const oh = openingHours?.find((x) => x.key === dayKey);
  if (!oh) return false; // brak konfiguracji → fallback, nie "zamknięte"
  const openVal = oh.open as any;
  return openVal === false || openVal === "false" || openVal === "" || openVal === null || openVal === undefined;
}

export function getOpenCloseForDay(args: { date: string; openingHours: OpeningHour[] }) {
  const { date, openingHours } = args;

  const dayKey = weekdayKeyFromDate(date);
  const oh = openingHours?.find((x) => x.key === dayKey);
  if (!oh?.open || !oh?.close) return null;

  const r = resolveOpenCloseMinutes(oh);
  if (!r) return null;

  // openAt/closeAt liczymy w LOCAL (bez Z), ale dzień tygodnia bierzemy stabilnie z UTC
  const openAt = new Date(date + "T00:00:00");
  openAt.setHours(0, 0, 0, 0);
  const openReal = addMinutes(openAt, r.openM);

  const closeReal = addMinutes(openAt, r.closeM);

  return { openAt: openReal, closeAt: closeReal };
}

/**
 * Sloty co slotMinutes (np 60) startujące od:
 * open + afterOpen
 * i kończące na: close - latestStartBeforeClose
 */
export function buildHourlySlotsWithOffset(args: {
  date: string;
  openAt: Date;
  closeAt: Date;
  slotMinutes: number;
  reservationStartAfterOpeningMinutes: number;
  latestReservationStartBeforeClosingMinutes: number;
}) {
  const {
    openAt,
    closeAt,
    slotMinutes,
    reservationStartAfterOpeningMinutes,
    latestReservationStartBeforeClosingMinutes,
  } = args;

  const start = addMinutes(openAt, Number(reservationStartAfterOpeningMinutes || 0));
  const lastStart = addMinutes(closeAt, -Number(latestReservationStartBeforeClosingMinutes || 0));

  // zaokrąglenie do siatki slotów
  const s = new Date(start);
  const mod = s.getMinutes() % slotMinutes;
  if (mod !== 0) s.setMinutes(s.getMinutes() + (slotMinutes - mod), 0, 0);

  const out: string[] = [];
  for (let cur = new Date(s); cur <= lastStart; cur = addMinutes(cur, slotMinutes)) {
    // UI bilard/kręgle ma działać w ramach jednego dnia (bez 00:xx następnego)
    if (cur.getDate() !== openAt.getDate()) break;

    const hh = String(cur.getHours()).padStart(2, "0");
    const mm = String(cur.getMinutes()).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }

  return out;
}
