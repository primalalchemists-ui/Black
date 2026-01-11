import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { reservationCreateRequestSchema } from "@/lib/validation/reservations";

type OpeningHour = {
  key: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string; // "16:00"
  close: string; // "22:00" | "00:00"
  label?: string;
};

type Issue = { path: (string | number)[]; message: string };
const issue = (path: Issue["path"], message: string): Issue => ({ path, message });

function clampPartySize(n: number) {
  if (!Number.isFinite(n)) return 1;
  return Math.min(12, Math.max(1, Math.floor(n)));
}

function isQuarterHour(timeStr: string) {
  const m = Number(timeStr.split(":")[1] || "0");
  return m % 15 === 0;
}

function parseHHMM(timeStr: string) {
  const [h, m] = timeStr.split(":").map((x) => Number(x));
  return { h, m };
}

function minutesFromHHMM(timeStr: string) {
  const { h, m } = parseHHMM(timeStr);
  return h * 60 + m;
}

function hhmmFromMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function weekdayKeyFromDate(dateStr: string): OpeningHour["key"] {
  // date-only -> stabilnie bierzemy UTC day
  const d = new Date(dateStr + "T00:00:00.000Z");
  const map: OpeningHour["key"][] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return map[d.getUTCDay()];
}

// stabilny "day" w DB: 12:00 UTC danego dnia
function dayISOFromDateOnly(dateStr: string) {
  const [yy, mm, dd] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(yy, mm - 1, dd, 12, 0, 0, 0)).toISOString();
}

// current HH:MM w czasie serwera
function nowHHMM() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function isTodayLocal(dateOnly: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` === dateOnly;
}

// close może być 00:00 -> traktujemy jako 24:00 (czyli 1440)
function resolveOpenCloseMinutes(oh: OpeningHour) {
  const openM = minutesFromHHMM(oh.open);
  let closeM = minutesFromHHMM(oh.close);
  if (closeM <= openM) closeM += 24 * 60; // po północy
  return { openM, closeM };
}

function buildQuarterSlotsForDay(args: {
  date: string;
  openingHours: OpeningHour[];
  reservationStartAfterOpeningMinutes?: number;
  latestReservationStartBeforeClosingMinutes?: number;
}) {
  const dayKey = weekdayKeyFromDate(args.date);
  const oh = args.openingHours?.find((x) => x.key === dayKey);
  if (!oh?.open || !oh?.close) return [];

  const { openM, closeM } = resolveOpenCloseMinutes(oh);

  const startMin = Number(args.reservationStartAfterOpeningMinutes ?? 0);
  const endBuffer = Number(args.latestReservationStartBeforeClosingMinutes ?? 0);

  let start = openM + startMin;
  const latestStart = closeM - endBuffer;

  // round up to next 15
  const mod = start % 15;
  if (mod !== 0) start += 15 - mod;

  const slots: string[] = [];
  for (let cur = start; cur <= latestStart; cur += 15) {
    // nie pokazujemy godzin po północy w UI tego samego dnia
    if (cur >= 24 * 60) break;
    slots.push(hhmmFromMinutes(cur));
  }
  return slots;
}

// ✅ u Ciebie openingHours siedzi w globalu site-settings jako JSON
async function getOpeningHours(payload: any): Promise<OpeningHour[]> {
  try {
    const g = await payload.findGlobal({ slug: "site-settings" });
    if (Array.isArray(g?.openingHours)) return g.openingHours as OpeningHour[];
  } catch {}
  return [];
}

type SlotOut = { time: string; remaining: number; canBook: boolean };

/**
 * GET /api/reservations/stoliki?date=YYYY-MM-DD&partySize=2
 */
export async function GET(req: Request) {
  const payload = await getPayload({ config });
  const { searchParams } = new URL(req.url);

  const date = searchParams.get("date");
  const partySize = clampPartySize(Number(searchParams.get("partySize") || 1));
  if (!date) return NextResponse.json({ ok: false, error: "MISSING_DATE" }, { status: 400 });

  const settings = await payload.findGlobal({ slug: "reservation-settings" });
  const t = settings?.tables ?? {};

  const enabled = Boolean(t?.enabled);
  const disabledMessage = t?.disabledMessage ?? null;
  const availableTablesCount = Number(t?.availableTablesCount ?? 0);
  const tablesNeeded = Math.max(1, Math.ceil(partySize / 4));

  if (!enabled) {
    return NextResponse.json({ ok: true, enabled, disabledMessage, availableTablesCount, tablesNeeded, slots: [] });
  }

  const latestBeforeClose = Number(t?.latestReservationStartBeforeClosingMinutes ?? 0);
  const afterOpen = Number(t?.reservationStartAfterOpeningMinutes ?? 0);

  const openingHours = await getOpeningHours(payload);

  const slots = openingHours.length
    ? buildQuarterSlotsForDay({
        date,
        openingHours,
        reservationStartAfterOpeningMinutes: afterOpen,
        latestReservationStartBeforeClosingMinutes: latestBeforeClose,
      })
    : (() => {
        // fallback: 16:00-22:00
        const openM = 16 * 60;
        const closeM = 22 * 60;
        let start = openM + afterOpen;
        const latestStart = closeM - latestBeforeClose;

        const mod = start % 15;
        if (mod !== 0) start += 15 - mod;

        const out: string[] = [];
        for (let cur = start; cur <= latestStart; cur += 15) out.push(hhmmFromMinutes(cur));
        return out;
      })();

  // ✅ BLOKOWANIE "od startu do końca dnia":
  // remaining(slot) = available - suma(rezerwacji start <= slot)  dla statusów new/confirmed
  const dayISO = dayISOFromDateOnly(date);

  const existing = await payload.find({
    collection: "reservations",
    limit: 5000,
    where: {
      and: [
        { type: { equals: "stolik" } },
        { day: { equals: dayISO } },
        { status: { in: ["new", "confirmed"] } },
      ],
    },
  });

  const startBuckets = new Map<number, number>();
  for (const r of existing?.docs || []) {
    const hh = Number((r as any).startHour ?? NaN);
    const mm = Number((r as any).startMinute ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const startM = hh * 60 + mm;
    const prev = startBuckets.get(startM) || 0;
    startBuckets.set(startM, prev + (Number((r as any).tablesCount) || 0));
  }

  const startsSorted = Array.from(startBuckets.entries()).sort((a, b) => a[0] - b[0]);

  const isToday = isTodayLocal(date);
  const nowM = minutesFromHHMM(nowHHMM());

  const out: SlotOut[] = [];
  let runningTaken = 0;
  let idx = 0;

  for (const time of slots) {
    const slotM = minutesFromHHMM(time);

    // prefix: dodaj wszystkie rezerwacje startujące <= slot
    while (idx < startsSorted.length && startsSorted[idx][0] <= slotM) {
      runningTaken += startsSorted[idx][1];
      idx++;
    }

    const remaining = Math.max(0, availableTablesCount - runningTaken);

    // ✅ nie pokazuj jako dostępne godzin, które już minęły dziś
    const timePassed = isToday ? slotM <= nowM : false;

    const canBook = !timePassed && remaining >= tablesNeeded && availableTablesCount > 0;

    out.push({ time, remaining, canBook });
  }

  return NextResponse.json({
    ok: true,
    enabled,
    disabledMessage,
    availableTablesCount,
    tablesNeeded,
    slots: out,
  });
}

/**
 * POST /api/reservations/stoliki
 */
export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config });

    const body = await req.json().catch(() => null);
    const parsed = reservationCreateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
        { status: 400 }
      );
    }

    const data = parsed.data;
    if (data.type !== "stolik") {
      return NextResponse.json(
        { error: "BAD_TYPE", issues: [issue(["type"], "Ten endpoint obsługuje tylko stoliki.")] },
        { status: 400 }
      );
    }

    const settings = await payload.findGlobal({ slug: "reservation-settings" });
    const t = settings?.tables ?? {};

    if (!t?.enabled) {
      return NextResponse.json(
        { error: "RESERVATIONS_DISABLED", message: t?.disabledMessage ?? "Rezerwacje stolików są obecnie wyłączone." },
        { status: 409 }
      );
    }

    const available = Number(t?.availableTablesCount ?? 0);
    if (available <= 0) {
      return NextResponse.json(
        { error: "NO_AVAILABILITY", issues: [issue(["tablesCount"], "Brak dostępnych stolików.")] },
        { status: 409 }
      );
    }

    const dateOnly = String((data as any).date || "");
    const time = String((data as any).hour || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      return NextResponse.json({ error: "BAD_DATE", issues: [issue(["date"], "Niepoprawna data.")] }, { status: 400 });
    }

    if (!/^\d{2}:\d{2}$/.test(time) || !isQuarterHour(time)) {
      return NextResponse.json(
        { error: "BAD_TIME", issues: [issue(["hour"], "Rezerwacje są możliwe wyłącznie co 15 minut (HH:MM).")] },
        { status: 400 }
      );
    }

    // ✅ blokuj przeszłe godziny dzisiaj
    if (isTodayLocal(dateOnly)) {
      const nowM = minutesFromHHMM(nowHHMM());
      const slotM = minutesFromHHMM(time);
      if (slotM <= nowM) {
        return NextResponse.json(
          { error: "PAST_TIME", issues: [issue(["hour"], "Nie można rezerwować godzin, które już minęły.")] },
          { status: 409 }
        );
      }
    }

    const partySize = clampPartySize(Number((data as any).partySize || 1));
    const requestedTables = Math.max(1, Math.ceil(partySize / 4));

    const latestBeforeClose = Number(t?.latestReservationStartBeforeClosingMinutes ?? 0);
    const afterOpen = Number(t?.reservationStartAfterOpeningMinutes ?? 0);

    const openingHours = await getOpeningHours(payload);
    if (openingHours.length > 0) {
      const allowed = buildQuarterSlotsForDay({
        date: dateOnly,
        openingHours,
        reservationStartAfterOpeningMinutes: afterOpen,
        latestReservationStartBeforeClosingMinutes: latestBeforeClose,
      });
      if (!allowed.includes(time)) {
        return NextResponse.json(
          { error: "CLOSED", issues: [issue(["hour"], "Wybrana godzina jest poza godzinami rezerwacji.")] },
          { status: 409 }
        );
      }
    }

    // ✅ sprawdzamy dostępność "od startu do końca dnia" dla wybranego slotu
    const dayISO = dayISOFromDateOnly(dateOnly);

    const existing = await payload.find({
      collection: "reservations",
      limit: 5000,
      where: {
        and: [
          { type: { equals: "stolik" } },
          { day: { equals: dayISO } },
          { status: { in: ["new", "confirmed"] } },
        ],
      },
    });

    const slotM = minutesFromHHMM(time);
    let takenUpToSlot = 0;

    for (const r of existing?.docs || []) {
      const hh = Number((r as any).startHour ?? NaN);
      const mm = Number((r as any).startMinute ?? NaN);
      if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
      const startM = hh * 60 + mm;

      // prefix: start <= slot
      if (startM <= slotM) takenUpToSlot += (Number((r as any).tablesCount) || 0);
    }

    const remaining = Math.max(0, available - takenUpToSlot);
    if (requestedTables > remaining) {
      return NextResponse.json(
        { error: "NO_AVAILABILITY", issues: [issue(["tablesCount"], "Brak dostępnych stolików na wybrany termin.")] },
        { status: 409 }
      );
    }

    // zapis
    const { h, m } = parseHHMM(time);
    const startHour = String(h);
    const startMinute = String(m);

    // endsAt tylko informacyjnie (+60)
    const startsAt = new Date(dateOnly + "T" + time + ":00");
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + 60);

    const endHour = String(endsAt.getHours());
    const endMinute = String(endsAt.getMinutes());

    const reservationDoc = await payload.create({
      collection: "reservations",
      data: {
        type: "stolik",
        customer: {
          firstName: (data as any).firstName,
          lastName: (data as any).lastName,
          phone: (data as any).phone,
          email: (data as any).email,
        },
        notes: (data as any).notes || "",

        day: dayISO,
        allDay: false,
        startHour,
        startMinute,
        endHour,
        endMinute,

        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),

        partySize,
        tablesCount: requestedTables,

        invoice: { wantInvoice: (data as any).wantInvoice, nip: (data as any).nip || "" },
        acceptRules: Boolean((data as any).acceptRules),

        source: "online",
        status: "new",
        paymentStatus: "not_required",
      },
    });

    return NextResponse.json({ ok: true, reservationId: reservationDoc.id });
  } catch (e: any) {
    console.error("[/api/reservations/stoliki] POST error:", e);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: e?.message ?? String(e), stack: process.env.NODE_ENV === "development" ? e?.stack : undefined },
      { status: 500 }
    );
  }
}
