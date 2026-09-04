import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

import {
  toDateAtHourMinute,
  startOfDay,
  endOfDay,
  overlaps,
  resourceTypeForReservation,
  mapServiceForBlackout,
} from "../_shared";

type Status = "free" | "busy" | "blocked";

type OpeningHour = {
  key: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string;  // "16:00"
  close: string; // "22:00" | "00:00" | "02:00"
};

function weekdayKeyFromDateUTC(dateStr: string): OpeningHour["key"] {
  // stabilnie: date-only w UTC
  const d = new Date(dateStr + "T00:00:00.000Z");
  const map: OpeningHour["key"][] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[d.getUTCDay()];
}

function parseHHMM(s: string) {
  const [h, m] = s.split(":").map((x) => Number(x));
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

function minutesFromHHMM(s: string) {
  const { h, m } = parseHHMM(s);
  return h * 60 + m;
}

function hhmmFromMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// close może być <= open (po północy) => +1440
function resolveOpenCloseMinutes(oh: OpeningHour) {
  const openM = minutesFromHHMM(oh.open);
  let closeM = minutesFromHHMM(oh.close);
  if (closeM <= openM) closeM += 24 * 60;
  return { openM, closeM };
}

// round UP do pełnej godziny
function roundUpToHour(mins: number) {
  const mod = mins % 60;
  if (mod === 0) return mins;
  return mins + (60 - mod);
}

function minutesToHM(total: number) {
  return { h: Math.floor(total / 60), m: total % 60 };
}

function floatFromMinutes(total: number) {
  return Number((total / 60).toFixed(4));
}

// relationship IDs extractor
function relIds(val: any): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .map((x) => {
      if (!x) return null;
      if (typeof x === "string" || typeof x === "number") return String(x);
      if (typeof x === "object") {
        if (x.id != null) return String(x.id);
        if (x._id != null) return String(x._id);
        if (x.value != null) {
          const v = x.value;
          if (typeof v === "string" || typeof v === "number") return String(v);
          if (v?.id != null) return String(v.id);
          if (v?._id != null) return String(v._id);
        }
      }
      return null;
    })
    .filter(Boolean) as string[];
}

async function getOpeningHours(payload: any): Promise<OpeningHour[]> {
  try {
    const g = await payload.findGlobal({ slug: "site-settings" });
    if (Array.isArray(g?.openingHours)) return g.openingHours as OpeningHour[];
  } catch {}
  return [];
}

function pickNumber(obj: any, keys: string[], fallback: number) {
  for (const k of keys) {
    const v = obj?.[k];
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * GET /api/reservations/availability?type=bilard|kregle&date=YYYY-MM-DD
 */
export async function GET(req: Request) {
  const payload = await getPayload({ config });
  const { searchParams } = new URL(req.url);

  const type = searchParams.get("type"); // "bilard" | "kregle"
  const date = searchParams.get("date");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: "BAD_DATE" }, { status: 400 });
  }
  if (type !== "bilard" && type !== "kregle") {
    return NextResponse.json({ ok: false, error: "BAD_TYPE" }, { status: 400 });
  }

  // SETTINGS
  const settings = await payload.findGlobal({ slug: "reservation-settings" });
  const section = type === "bilard" ? settings?.billiard : settings?.bowling;

  const enabled = Boolean(section?.enabled ?? true);
  const disabledMessage = section?.disabledMessage ?? null;
  const pricePerHour = pickNumber(section, ["pricePerHour"], type === "bilard" ? 50 : 120);

  const startAfterOpeningMinutes = pickNumber(
    section,
    ["reservationStartAfterOpeningMinutes", "startAfterOpeningMinutes"],
    0
  );
  const latestStartBeforeClosingMinutes = pickNumber(
    section,
    ["latestReservationStartBeforeClosingMinutes", "latestStartBeforeClosingMinutes"],
    60
  );

  // OPENING HOURS
  const openingHours = await getOpeningHours(payload);

  // fallback
  let openStr = "16:00";
  let closeStr = "22:00";

  if (openingHours.length) {
    const dayKey = weekdayKeyFromDateUTC(date);
    const oh = openingHours.find((x) => x.key === dayKey);
    if (oh?.open) openStr = oh.open;
    if (oh?.close) closeStr = oh.close;
  }

  // resolve open/close with midnight support
  const { openM, closeM } = resolveOpenCloseMinutes({ key: "monday", open: openStr, close: closeStr });

  // first possible start + round up to full hour
  let firstStart = openM + startAfterOpeningMinutes;
  firstStart = roundUpToHour(firstStart);

  const latestStart = closeM - latestStartBeforeClosingMinutes;

  // slots co 60min, ale nie pokazuj po północy (>=1440)
  const slotMinutesList: number[] = [];
  for (let cur = firstStart; cur <= latestStart; cur += 60) {
    if (cur >= 24 * 60) break; // nie pokazuj "01:00" itd dla tego dnia
    slotMinutesList.push(cur);
  }

  const slots = slotMinutesList.map((m) => ({
    value: floatFromMinutes(m),
    label: hhmmFromMinutes(m),
  }));

  // RESOURCES
  const rType = resourceTypeForReservation(type);
  const service = mapServiceForBlackout(type);
  if (!rType || !service) return NextResponse.json({ ok: false, error: "BAD_TYPE" }, { status: 400 });

  const resourcesRes = await payload.find({
    collection: "resources",
    limit: 200,
    where: { and: [{ type: { equals: rType } }, { active: { equals: true } }] },
    sort: "number",
  });

  const resources = (resourcesRes.docs || []).map((r: any) => ({
    id: String(r.id),
    number: Number(r.number),
    label: r.label ?? null,
    active: Boolean(r.active),
  }));

  const idToNumber = new Map<string, number>();
  for (const r of resources) idToNumber.set(r.id, r.number);

  // BLACKOUTS
  const bRes = await payload.find({
    collection: "blackouts",
    limit: 500,
    where: {
      and: [
        { active: { equals: true } },
        { service: { equals: service } },
        { day: { greater_than_equal: startOfDay(date).toISOString() } },
        { day: { less_than_equal: endOfDay(date).toISOString() } },
      ],
    },
  });

  const blackouts = bRes.docs || [];

  function blackoutTouchesResource(b: any, resourceId: string) {
    const ids = relIds(b.resources);
    return ids.includes(resourceId);
  }

  function blackoutRange(dateStr: string, b: any) {
    if (b.allDay) return { s: startOfDay(dateStr), e: endOfDay(dateStr) };

    const sh = Number(b.startHour);
    const sm = Number(b.startMinute ?? 0);
    const eh = Number(b.endHour);
    const em = Number(b.endMinute ?? 0);

    if (!Number.isFinite(sh) || !Number.isFinite(eh)) return null;

    const s = toDateAtHourMinute(dateStr, sh, sm);
    const e = toDateAtHourMinute(dateStr, eh, em);
    if (e <= s) return null;

    return { s, e };
  }

  // EXISTING RESERVATIONS (busy)
  const dayStartISO = startOfDay(date).toISOString();
  const dayEndISO = endOfDay(date).toISOString();

  const nowISO = new Date().toISOString();

  const existing = await payload.find({
    collection: "reservations",
    limit: 2000,
    where: {
      and: [
        { type: { equals: type } },
        { status: { not_equals: "cancelled" } },
        { status: { not_equals: "no_show" } },
        { startsAt: { less_than: dayEndISO } },
        { endsAt: { greater_than: dayStartISO } },
        // wyklucz wygasłe oczekujące na płatność — slot zwalnia się po
        // expiresAt (15 min), NIEZALEŻNIE od tego, czy cleanup zdążył już
        // zmienić status rekordu. Ta sama klauzula co w routach rezerwacji.
        {
          or: [
            { paymentStatus: { not_equals: "pending" } },
            { expiresAt: { exists: false } },
            { expiresAt: { greater_than_equal: nowISO } },
          ],
        } as any,
      ],
    },
  });

  const reservations = existing.docs || [];

  // statusMap `${resourceId}-${HH:MM}` jak w ResourceGrid (slot.statuses[r.id])
  const statusMap: Record<string, Status> = {};
  for (const slot of slots) {
    for (const r of resources) {
      statusMap[`${r.id}-${slot.label}`] = enabled ? "free" : "blocked";
    }
  }

  // blackouts -> blocked
  for (const b of blackouts) {
    const range = blackoutRange(date, b);
    for (const r of resources) {
      if (!blackoutTouchesResource(b, r.id)) continue;

      for (const slotM of slotMinutesList) {
        const { h, m } = minutesToHM(slotM);
        const { h: eh, m: em } = minutesToHM(slotM + 60);

        const slotStart = toDateAtHourMinute(date, h, m);
        const slotEnd = toDateAtHourMinute(date, eh, em);

        const label = hhmmFromMinutes(slotM);
        if (b.allDay || (range && overlaps(range.s, range.e, slotStart, slotEnd))) {
          statusMap[`${r.id}-${label}`] = "blocked";
        }
      }
    }
  }

  // reservations -> busy (nie nadpisuj blocked)
  for (const res of reservations) {
    const rStart = new Date((res as any).startsAt);
    const rEnd = new Date((res as any).endsAt);

    const resIds = relIds((res as any).resources);
    for (const resourceId of resIds) {
      if (!idToNumber.has(resourceId)) continue;

      for (const slotM of slotMinutesList) {
        const { h, m } = minutesToHM(slotM);
        const { h: eh, m: em } = minutesToHM(slotM + 60);

        const slotStart = toDateAtHourMinute(date, h, m);
        const slotEnd = toDateAtHourMinute(date, eh, em);

        if (!overlaps(rStart, rEnd, slotStart, slotEnd)) continue;

        const label = hhmmFromMinutes(slotM);
        const key = `${resourceId}-${label}`;
        if (statusMap[key] !== "blocked") statusMap[key] = "busy";
      }
    }
  }

  // zwrot w formacie kompatybilnym z ResourceGrid (sloty + statuses per resourceId)
  const apiSlots = slots.map((s) => {
    const statuses: Record<string, Status> = {};
    for (const r of resources) {
      statuses[r.id] = statusMap[`${r.id}-${s.label}`] ?? (enabled ? "free" : "blocked");
    }
    return { time: s.label, statuses };
  });

  return NextResponse.json({
    ok: true,
    enabled,
    disabledMessage,
    pricePerHour,
    slotMinutes: 60,
    resources: resources.map(({ id, number, label }) => ({ id, number, label })),
    slots: apiSlots,
  });
}
