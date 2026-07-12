import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { reservationCreateRequestSchema } from "@/lib/validation/reservations";
import { getNowInWarsaw, isSlotBookableWithLeadTime, getNextReservationNumber } from "../_shared";
import { getBlockingEvent, getBlockingEventsForDay, isSlotBlockedByVenueEvent } from "@/lib/openingHours";
import { getMailClient, getMailFrom, getOwnerTo, effectiveTo } from "@/lib/mail";
import { stolikClientText, stolikOwnerText, stolikClientHtml, stolikOwnerHtml } from "@/lib/mailTemplates";

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
  return Math.min(16, Math.max(1, Math.floor(n)));
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
 * Liczy sumę partySize rezerwacji, które nakładają się czasowo z nowym slotem S.
 *
 * Nowa rezerwacja: [S, S + blockDuration)
 * Istniejąca:     [T, T + blockDuration)
 * Overlap: T < S + blockDuration AND T + blockDuration > S
 *       ↔  S - blockDuration < T < S + blockDuration  (strict na obu krańcach)
 *
 * Granice wyłączne: rezerwacja kończąca się dokładnie o S (T + D = S) nie blokuje.
 */
function takenSeatsInWindow(existingDocs: any[], slotM: number, blockDurationMinutes: number) {
  const from = slotM - blockDurationMinutes; // exclusive
  const to   = slotM + blockDurationMinutes; // exclusive

  let taken = 0;
  for (const r of existingDocs || []) {
    const hh = Number((r as any).startHour ?? NaN);
    const mm = Number((r as any).startMinute ?? NaN);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;

    const startM = hh * 60 + mm;
    if (startM > from && startM < to) {
      taken += Number((r as any).partySize) || 0;
    }
  }
  return taken;
}

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
  const onlineSeatsLimit = Number(t?.availableTablesCount ?? 0);
  const blockDuration = Number(t?.arrivalWindowBeforeMinutes ?? 120);

  if (!enabled) {
    return NextResponse.json({ ok: true, enabled, disabledMessage, availableTablesCount: onlineSeatsLimit, slots: [] });
  }

  const latestBeforeClose = Number(t?.latestReservationStartBeforeClosingMinutes ?? 0);
  const afterOpen = Number(t?.reservationStartAfterOpeningMinutes ?? 0);

  const openingHours = await getOpeningHours(payload);

  // Lokal nieczynny tego dnia
  if (openingHours.length > 0) {
    const dayKeyCheck = weekdayKeyFromDate(date);
    const dayEntry = openingHours.find((x) => x.key === dayKeyCheck);
    if (dayEntry) {
      const openVal = (dayEntry.open as any);
      if (openVal === false || openVal === "false" || openVal === "" || openVal === null || openVal === undefined) {
        return NextResponse.json({
          ok: true,
          enabled: false,
          disabledMessage: "Brak możliwości rezerwacji — lokal nieczynny.",
          availableTablesCount: onlineSeatsLimit,
          slots: [],
        });
      }
    }
  }

  // Pobierz wydarzenia blokujące lokal (całodniowe blokują od razu, częściowe — per-slot)
  const venueBlockingEvents = await getBlockingEventsForDay(date);
  const wholeDayBlocked = venueBlockingEvents.some((e: any) => e.allDay || e.blockAllDay);
  if (wholeDayBlocked) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      disabledMessage: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie.",
      availableTablesCount: onlineSeatsLimit,
      slots: [],
    });
  }

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

  const out: SlotOut[] = [];

  for (const time of slots) {
    const [slotHour, slotMinute] = time.split(":").map(Number);
    const slotM = minutesFromHHMM(time);

    const taken = takenSeatsInWindow(existing?.docs || [], slotM, blockDuration);
    const remaining = Math.max(0, onlineSeatsLimit - taken);

    const canBook =
      isSlotBookableWithLeadTime(date, slotHour, slotMinute, 15) &&
      remaining >= partySize &&
      onlineSeatsLimit > 0 &&
      !isSlotBlockedByVenueEvent(venueBlockingEvents, slotHour, slotMinute);

    out.push({ time, remaining, canBook });
  }

  return NextResponse.json({
    ok: true,
    enabled,
    disabledMessage,
    availableTablesCount: onlineSeatsLimit,
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

    const onlineSeatsLimit = Number(t?.availableTablesCount ?? 0);
    if (onlineSeatsLimit <= 0) {
      return NextResponse.json(
        { error: "NO_AVAILABILITY", issues: [issue(["partySize"], "Brak dostępnych miejsc online.")] },
        { status: 409 }
      );
    }

    const blockDuration = Number(t?.arrivalWindowBeforeMinutes ?? 120);

    const dateOnly = String((data as any).date || "");
    const time = String((data as any).hour || "");

    if (dateOnly) {
      const [slotH] = time.split(":").map(Number)
      const blockCheck = await getBlockingEvent(dateOnly, Number.isFinite(slotH) ? slotH : undefined)
      if (blockCheck.blocked) {
        return NextResponse.json(
          { error: "VENUE_BLOCKED", message: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie." },
          { status: 409 }
        )
      }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      return NextResponse.json({ error: "BAD_DATE", issues: [issue(["date"], "Niepoprawna data.")] }, { status: 400 });
    }

    if (!/^\d{2}:\d{2}$/.test(time) || !isQuarterHour(time)) {
      return NextResponse.json(
        { error: "BAD_TIME", issues: [issue(["hour"], "Rezerwacje są możliwe wyłącznie co 15 minut (HH:MM).")] },
        { status: 400 }
      );
    }

    // ✅ blokuj przeszłe sloty i wymuszaj 15-min wyprzedzenie (Europe/Warsaw)
    {
      const [slotHour, slotMinute] = time.split(":").map(Number);
      if (!isSlotBookableWithLeadTime(dateOnly, slotHour, slotMinute, 15)) {
        return NextResponse.json(
          { error: "PAST_TIME", issues: [issue(["hour"], "Nie można rezerwować godzin, które już minęły lub zaczynają się za mniej niż 15 minut.")] },
          { status: 409 }
        );
      }
    }

    const partySize = clampPartySize(Number((data as any).partySize || 1));

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

    const taken = takenSeatsInWindow(existing?.docs || [], slotM, blockDuration);
    const remaining = Math.max(0, onlineSeatsLimit - taken);

    if (partySize > remaining) {
      return NextResponse.json(
        { error: "NO_AVAILABILITY", issues: [issue(["partySize"], "Brak wystarczającej liczby miejsc na wybrany termin.")] },
        { status: 409 }
      );
    }

    // zapis
    const { h, m } = parseHHMM(time);
    const startHour = String(h);
    const startMinute = String(m);

    // startsAt/endsAt: blokada na blockDuration minut. Uwaga: to używa TZ serwera.
    const startsAt = new Date(dateOnly + "T" + time + ":00");
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(endsAt.getMinutes() + blockDuration);

    const endHour = String(endsAt.getHours());
    const endMinute = String(endsAt.getMinutes());

    const reservationNumber = await getNextReservationNumber(payload, "S");
    const groupId = crypto.randomUUID();

    const reservationDoc = await payload.create({
      collection: "reservations",
      data: {
        type: "stolik",
        reservationNumber,
        groupId,
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
        tablesCount: 1,

        invoice: { wantInvoice: (data as any).wantInvoice, nip: (data as any).nip || "" },
        acceptRules: Boolean((data as any).acceptRules),

        source: "online",
        status: "new",
        paymentStatus: "not_required",
      },
    });

    // Wyślij maile (nie blokuj odpowiedzi przy błędzie)
    try {
      const mail = getMailClient();
      const from = getMailFrom();
      const ownerEmail = getOwnerTo();
      const [yy, mm, dd] = dateOnly.split("-");
      const dateDisplay = `${dd}.${mm}.${yy}`;
      const clientEmail: string = (data as any).email ?? "";

      const stolikClientParams = {
        reservationNumber,
        date: dateDisplay,
        time,
        partySize,
        firstName: (data as any).firstName,
      }
      const stolikOwnerParams = {
        reservationNumber,
        date: dateDisplay,
        time,
        partySize,
        firstName: (data as any).firstName,
        lastName: (data as any).lastName,
        phone: (data as any).phone,
        email: clientEmail || "—",
      }

      if (clientEmail) {
        await mail.emails.send({
          from,
          to: effectiveTo(clientEmail),
          subject: `Potwierdzenie rezerwacji stolika — ${reservationNumber}`,
          text: stolikClientText(stolikClientParams),
          html: stolikClientHtml(stolikClientParams),
        });
      }

      await mail.emails.send({
        from,
        to: effectiveTo(ownerEmail),
        subject: `Nowa rezerwacja stolika — ${reservationNumber}`,
        text: stolikOwnerText(stolikOwnerParams),
        html: stolikOwnerHtml(stolikOwnerParams),
      });
    } catch (err) {
      console.error("[stoliki] Email error:", err);
    }

    return NextResponse.json({ ok: true, groupId, reservationId: reservationDoc.id, reservationNumber });
  } catch (e: any) {
    console.error("[/api/reservations/stoliki] POST error:", e);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: e?.message ?? String(e),
        stack: process.env.NODE_ENV === "development" ? e?.stack : undefined,
      },
      { status: 500 }
    );
  }
}
