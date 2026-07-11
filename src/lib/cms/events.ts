import { safeFetchJson } from "@/lib/cms/http";
import { formatDatePL, pad2, parseISODateLocal, toNumberSafe } from "@/lib/utils/date";

export type CmsEvent = {
  id: string | number;
  title: string;
  description?: string | null;
  kind?: "impreza" | "biznes" | null;

  day?: string | null;
  allDay?: boolean | null;
  startHour?: string | number | null;
  startMinute?: string | number | null;

  endHour?: string | number | null;
  endMinute?: string | number | null;

  capacity?: number | null;
  takenSeats?: number | null;
  imageUrl?: string | null;
  pricePLN?: number | null;
  registrationsEnabled?: boolean | null;
  showOnHomepage?: boolean | null;

  startsAt?: string | null;
  endsAt?: string | null;
};

export function renderPricePLN(pricePLN: number | null | undefined) {
  if (pricePLN == null) return null;
  if (pricePLN === 0) return "Darmowe";
  return `${pricePLN} zł`;
}

export function getEventDisplayDateTimePL(e: CmsEvent): { date: string; time: string } | null {
  if (e.day) {
    const d = parseISODateLocal(e.day);
    if (!d) return null;

    const date = formatDatePL(d);

    if (e.allDay) return { date, time: "Całodniowe" };

    const h = toNumberSafe(e.startHour, 0);
    const m = toNumberSafe(e.startMinute, 0);
    return { date, time: `${pad2(h)}:${pad2(m)}` };
  }

  if (e.startsAt) {
    const d = parseISODateLocal(e.startsAt);
    if (!d) return null;

    const date = formatDatePL(d);
    const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    return { date, time };
  }

  return null;
}

export function sortEventsStable(a: CmsEvent, b: CmsEvent) {
  const ad = a.day ? parseISODateLocal(a.day)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
  const bd = b.day ? parseISODateLocal(b.day)?.getTime() ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad - bd;

  const ah = toNumberSafe(a.startHour, 0);
  const bh = toNumberSafe(b.startHour, 0);
  if (ah !== bh) return ah - bh;

  const am = toNumberSafe(a.startMinute, 0);
  const bm = toNumberSafe(b.startMinute, 0);
  if (am !== bm) return am - bm;

  return String(a.title ?? "").localeCompare(String(b.title ?? ""), "pl");
}

export async function fetchCmsEvents(): Promise<CmsEvent[]> {
  const json: any = await safeFetchJson("/api/cms/events");
  const list: CmsEvent[] = Array.isArray(json?.events) ? json.events : [];
  return list;
}

export async function fetchEventsByKind(kind: NonNullable<CmsEvent["kind"]>) {
  const all = await fetchCmsEvents();
  return all.filter((e) => e?.kind === kind).sort(sortEventsStable);
}

export async function fetchEventsNotBusiness() {
  const all = await fetchCmsEvents();
  return all.filter((e) => e?.kind !== "biznes").sort(sortEventsStable);
}
