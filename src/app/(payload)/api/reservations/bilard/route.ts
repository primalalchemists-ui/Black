import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";
import { reservationCreateRequestSchema } from "@/lib/validation/reservations";
import { startOfLocalDayISO } from "../_shared";

import {
  toDateAtHour,
  toDateAtHourMinute,
  startOfDay,
  endOfDay,
  overlaps,
  resourceTypeForReservation,
  mapServiceForBlackout,
  hourFloatFromHHMM,
  getNowInWarsaw,
  isSlotBookableWithLeadTime,
  getNextReservationNumber,
} from "../_shared";

import { registerTransaction } from "@/lib/p24";

import { getOpeningHours, getOpenCloseForDay, buildHourlySlotsWithOffset, addMinutes, isDayClosed } from "../_openingHours";
import { getBlockingEventsForDay, isSlotBlockedByVenueEvent } from "@/lib/openingHours";
import { tryPaymentLock } from "@/lib/paymentLifecycle";

type CellStatus = "free" | "busy" | "blocked";

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

function blackoutRange(dateStr: string, b: any) {
  if (b.allDay) return { s: startOfDay(dateStr), e: endOfDay(dateStr) };

  const sh = Number(b.startHour);
  const sm = Number(b.startMinute ?? 0);
  const eh = Number(b.endHour);
  const em = Number(b.endMinute ?? 0);

  if (!Number.isFinite(sh) || !Number.isFinite(eh)) return null;

  const start = toDateAtHourMinute(dateStr, sh, sm);
  const end = toDateAtHourMinute(dateStr, eh, em);

  if (end <= start) return null;
  return { s: start, e: end };
}

// ✅ spójny dayISO z date-only
function dayISOFromDateOnly(dateStr: string) {
  const mid = new Date(dateStr + "T12:00:00");
  return startOfLocalDayISO(mid);
}

/**
 * GET /api/reservations/bilard?date=YYYY-MM-DD
 */
export async function GET(req: Request) {
  const payload = await getPayload({ config });
  const { searchParams } = new URL(req.url);

  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ ok: false, error: "MISSING_DATE" }, { status: 400 });
  const ownSessionId = searchParams.get("sessionId") ?? null;

  const settings = await payload.findGlobal({ slug: "reservation-settings" });
  const s = settings?.billiard ?? {};

  const enabled = Boolean(s?.enabled);
  const disabledMessage = s?.disabledMessage ?? null;
  const pricePerHour = Number(s?.pricePerHour ?? 50);

  const slotMinutes = 60;

  const openingHours = await getOpeningHours(payload);

  // Lokal nieczynny tego dnia
  if (openingHours.length > 0 && isDayClosed(date, openingHours)) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      disabledMessage: "Brak możliwości rezerwacji — lokal nieczynny.",
      pricePerHour,
      slotMinutes: 60,
      resources: [],
      slots: [],
    });
  }

  // Pobierz wydarzenia blokujące lokal (całodniowe blokują od razu, częściowe — per-slot)
  const venueBlockingEvents = await getBlockingEventsForDay(date);
  const wholeDayBlocked = venueBlockingEvents.some((e: any) => e.allDay || e.blockAllDay);
  if (wholeDayBlocked) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      disabledMessage: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie.",
      pricePerHour,
      slotMinutes: 60,
      resources: [],
      slots: [],
    });
  }

  const oc = getOpenCloseForDay({ date, openingHours });

  const openAt = oc?.openAt ?? new Date(date + "T00:00:00");
  if (!oc) openAt.setHours(16, 0, 0, 0);

  const closeAt = oc?.closeAt ?? new Date(date + "T00:00:00");
  if (!oc) closeAt.setHours(22, 0, 0, 0);

  const reservationStartAfterOpeningMinutes = Number(s?.reservationStartAfterOpeningMinutes ?? 0);
  const latestReservationStartBeforeClosingMinutes = Number(s?.latestReservationStartBeforeClosingMinutes ?? 60);

  const times = buildHourlySlotsWithOffset({
    date,
    openAt,
    closeAt,
    slotMinutes,
    reservationStartAfterOpeningMinutes,
    latestReservationStartBeforeClosingMinutes,
  });

  const rType = resourceTypeForReservation("bilard");
  const service = mapServiceForBlackout("bilard");
  if (!rType || !service) return NextResponse.json({ ok: false, error: "BAD_TYPE" }, { status: 400 });

  const res = await payload.find({
    collection: "resources",
    limit: 200,
    where: { and: [{ type: { equals: rType } }, { active: { equals: true } }] },
    sort: "number",
  });

  const resources = (res.docs || []).map((r: any) => ({
    id: String(r.id),
    number: Number(r.number),
    label: r.label ?? null,
  }));

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

  const dayStartISO = startOfDay(date).toISOString();
  const dayEndISO = endOfDay(date).toISOString();
  const dayISO = dayISOFromDateOnly(date);

  const nowISO = new Date().toISOString();

  const existing = await payload.find({
    collection: "reservations",
    limit: 2000,
    where: {
      and: [
        { type: { equals: "bilard" } },
        { status: { in: ["new", "confirmed"] } },
        {
          or: [
            { day: { equals: dayISO } },
            {
              and: [
                { day: { exists: false } },
                { startsAt: { less_than: dayEndISO } },
                {
                  or: [
                    { endsAt: { exists: false } },
                    { endsAt: { greater_than: dayStartISO } },
                  ],
                },
              ],
            },
          ],
        },
        // wyklucz wygasłe oczekujące na płatność
        {
          or: [
            { paymentStatus: { not_equals: "pending" } },
            { expiresAt: { exists: false } },
            { expiresAt: { greater_than_equal: nowISO } },
          ],
        } as any,
        // wyklucz własną sesję użytkownika (powrót z P24 — self-blocking prevention)
        ...(ownSessionId ? [{ groupId: { not_equals: ownSessionId } }] : []),
      ],
    },
  });

  // ✅ past-slots gate (Europe/Warsaw, 15-min lead time)
  function statusForSlot(args: { slotStart: Date; slotEnd: Date; resourceId: string; slotHour: number; slotMinute: number }): CellStatus {
    if (!enabled) return "blocked";
    if (!isSlotBookableWithLeadTime(date, args.slotHour, args.slotMinute, 15)) return "blocked";
    if (isSlotBlockedByVenueEvent(venueBlockingEvents, args.slotHour, args.slotMinute)) return "blocked";

    const blocked = (bRes.docs || []).some((b: any) => {
      const ids = relIds(b.resources);
      if (!ids.includes(args.resourceId)) return false;

      const range = blackoutRange(date, b);
      if (!range) return false;

      return overlaps(range.s, range.e, args.slotStart, args.slotEnd);
    });

    if (blocked) return "blocked";

    const busy = (existing.docs || []).some((r: any) => {
      const rr = relIds(r.resources);
      if (!rr.includes(args.resourceId)) return false;

      const rSegs = Array.isArray(r.segments) ? r.segments as any[] : [];
      if (rSegs.length > 0) {
        return rSegs.some((seg: any) => {
          const segResId = String(typeof seg.resource === "object" ? (seg.resource?.id ?? seg.resource) : (seg.resource ?? ""))
          if (segResId !== args.resourceId) return false
          const segStart = toDateAtHourMinute(date, Number(seg.startHour ?? 0), Number(seg.startMinute ?? 0))
          const segEnd = toDateAtHourMinute(date, Number(seg.endHour ?? 0), Number(seg.endMinute ?? 0))
          return overlaps(segStart, segEnd, args.slotStart, args.slotEnd)
        })
      }

      const rStart = new Date(r.startsAt);
      const rEnd = r.endsAt ? new Date(r.endsAt) : endOfDay(date); // ✅ FIX
      return overlaps(rStart, rEnd, args.slotStart, args.slotEnd);
    });

    return busy ? "busy" : "free";
  }

  const slots = times.map((t) => {
    const [slotHour, slotMinute] = t.split(":").map(Number);
    const startHourFloat = hourFloatFromHHMM(t);
    const slotStart = toDateAtHour(date, startHourFloat);
    const slotEnd = addMinutes(slotStart, slotMinutes);

    const statuses: Record<string, CellStatus> = {};
    for (const r of resources) {
      statuses[r.id] = statusForSlot({ slotStart, slotEnd, resourceId: r.id, slotHour, slotMinute });
    }

    return { time: t, statuses };
  });

  return NextResponse.json({
    ok: true,
    enabled,
    disabledMessage,
    pricePerHour,
    slotMinutes,
    resources,
    slots,
  });
}

/**
 * POST /api/reservations/bilard
 * segments[] -> jeden rekord w reservations z wszystkimi stołami w resources[]
 */
const CONTACT_MSG = "Nie udało się przetworzyć płatności. Skontaktuj się z obsługą lokalu: 601 275 261."

export async function POST(req: Request) {
  try {
  const payload = await getPayload({ config });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });

  const parsed = reservationCreateRequestSchema.safeParse(body);

  const readSegments = (val: any) => {
    if (!val) return null;
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val.trim()) {
      try {
        const p = JSON.parse(val);
        return Array.isArray(p) ? p : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const segmentsRaw = readSegments((body as any).segments);
  const useSegments = Array.isArray(segmentsRaw) && segmentsRaw.length > 0;

  const data: any = parsed.success ? parsed.data : body;

  // replaceSessionId: atomowe zastąpienie starej sesji — eliminuje race window przy ponownym submicie
  const replaceSessionId: string | null = typeof body?.replaceSessionId === "string" ? body.replaceSessionId.trim() || null : null
  let oldReservationId: number | null = null

  if (replaceSessionId) {
    const validResult = await tryPaymentLock(payload, replaceSessionId, async () => {
      const oldRes = await payload.find({
        collection: "reservations",
        limit: 1,
        overrideAccess: true,
        where: {
          and: [
            { groupId: { equals: replaceSessionId } },
            { type: { equals: "bilard" } },
          ],
        },
      })
      if (!oldRes.docs.length) return { error: "REPLACE_NOT_FOUND" as const }
      const old = oldRes.docs[0] as any
      if ((old.customer?.email ?? "") !== (data.email ?? "")) return { error: "REPLACE_OWNERSHIP" as const }
      if (old.paymentStatus === "paid" || old.status === "confirmed") return { error: "REPLACE_PAID" as const }
      if (old.paymentStatus === "verifying") return { error: "REPLACE_VERIFYING" as const }
      if (old.paymentStatus !== "pending") return { error: "REPLACE_INVALID_STATUS" as const }
      const pmtCheck = await payload.find({
        collection: "payments",
        limit: 1,
        overrideAccess: true,
        where: { p24SessionId: { equals: replaceSessionId } },
      })
      if (pmtCheck.docs.length > 0) {
        const pmt = pmtCheck.docs[0] as any
        if (pmt.status === "paid" || pmt.status === "refunded") return { error: "REPLACE_PAID" as const }
      }
      return { oldId: old.id as number }
    })

    if (validResult === null) {
      return NextResponse.json({ error: "REPLACE_LOCKED", message: "Poprzednia sesja jest weryfikowana. Odczekaj chwilę i spróbuj ponownie." }, { status: 409 })
    }
    if ("error" in validResult) {
      const msgs: Record<string, string> = {
        REPLACE_NOT_FOUND: "Poprzednia sesja rezerwacji nie istnieje.",
        REPLACE_OWNERSHIP: "Adres e-mail nie pasuje do poprzedniej sesji.",
        REPLACE_PAID: "Poprzednia sesja została już opłacona.",
        REPLACE_VERIFYING: "Poprzednia sesja jest w trakcie weryfikacji płatności.",
        REPLACE_INVALID_STATUS: "Poprzednia sesja ma nieprawidłowy status.",
      }
      return NextResponse.json({ error: validResult.error, message: msgs[validResult.error] ?? "Błąd walidacji sesji poprzedniej." }, { status: 409 })
    }
    oldReservationId = validResult.oldId
  }

  if (data.type !== "bilard") {
    return NextResponse.json(
      { error: "BAD_TYPE", issues: [{ path: ["type"], message: "Ten endpoint obsługuje tylko bilard." }] },
      { status: 400 }
    );
  }

  const settings = await payload.findGlobal({ slug: "reservation-settings" });
  const s = settings?.billiard ?? {};

  if (!s?.enabled) {
    return NextResponse.json(
      { error: "RESERVATIONS_DISABLED", message: s?.disabledMessage ?? "Rezerwacje bilardu są obecnie wyłączone." },
      { status: 409 }
    );
  }

  const todayISO = getNowInWarsaw().dateStr;

  if (typeof data?.date === "string" && data.date < todayISO) {
    return NextResponse.json(
      { error: "NO_AVAILABILITY", issues: [{ path: ["date"], message: "Nie można rezerwować terminu z przeszłości." }] },
      { status: 409 }
    );
  }

  // Walidacja godzin otwarcia + dzień nieczynny
  const openingHours = await getOpeningHours(payload)
  if (openingHours.length > 0 && isDayClosed(data.date, openingHours)) {
    return NextResponse.json(
      { error: "CLOSED", message: "Brak możliwości rezerwacji — lokal nieczynny." },
      { status: 409 }
    )
  }

  // Eventy blokujące lokal — całodniowe odrzucamy od razu; per-slot sprawdzamy w Pass 1
  const venueBlockingEvents = await getBlockingEventsForDay(data.date)
  const wholeDayBlocked = venueBlockingEvents.some((e: any) => e.allDay || e.blockAllDay)
  if (wholeDayBlocked) {
    return NextResponse.json(
      { error: "VENUE_BLOCKED", message: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie." },
      { status: 409 }
    )
  }

  const oc = openingHours.length ? getOpenCloseForDay({ date: data.date, openingHours }) : null
  const reservationStartAfterOpeningMinutes = Number(s?.reservationStartAfterOpeningMinutes ?? 0)
  const latestReservationStartBeforeClosingMinutes = Number(s?.latestReservationStartBeforeClosingMinutes ?? 60)

  const rType = resourceTypeForReservation("bilard");
  const service = mapServiceForBlackout("bilard");
  if (!rType || !service) return NextResponse.json({ error: "BAD_TYPE" }, { status: 400 });

  const bRes = await payload.find({
    collection: "blackouts",
    limit: 500,
    where: {
      and: [
        { active: { equals: true } },
        { service: { equals: service } },
        { day: { greater_than_equal: startOfDay(data.date).toISOString() } },
        { day: { less_than_equal: endOfDay(data.date).toISOString() } },
      ],
    },
  });

  const dayStartISO = startOfDay(data.date).toISOString();
  const dayEndISO = endOfDay(data.date).toISOString();
  const dayISO = dayISOFromDateOnly(data.date);

  const existing = await payload.find({
    collection: "reservations",
    limit: 2000,
    where: {
      and: [
        { type: { equals: "bilard" } },
        { status: { in: ["new", "confirmed"] } },
        {
          or: [
            { day: { equals: dayISO } },
            {
              and: [
                { day: { exists: false } },
                { startsAt: { less_than: dayEndISO } },
                {
                  or: [
                    { endsAt: { exists: false } },
                    { endsAt: { greater_than: dayStartISO } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });

  if (useSegments) {
    const segs = segmentsRaw as any[];

    const resourceNumbers = segs
      .map((x) => Number(x?.resource))
      .filter((n) => Number.isFinite(n) && n >= 1);

    if (resourceNumbers.length !== segs.length) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: [{ path: ["segments"], message: "Niepoprawne segments (resource/startHour/endHour)." }] },
        { status: 400 }
      );
    }

    const found = await payload.find({
      collection: "resources",
      limit: 200,
      where: { and: [{ type: { equals: rType } }, { number: { in: resourceNumbers } }, { active: { equals: true } }] },
    });

    const numToId = new Map<number, string>();
    for (const d of found.docs as any[]) numToId.set(Number(d.number), String(d.id));

    if (numToId.size !== resourceNumbers.length) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", issues: [{ path: ["segments"], message: "Nie znaleziono wszystkich zasobów." }] },
        { status: 400 }
      );
    }

    const pricePerHour = Number(s?.pricePerHour ?? 50);

    type SegItem = { resourceNumber: number; resourceId: string; startsAt: Date; endsAt: Date; segmentPrice: number };
    const toCreate: SegItem[] = [];

    // Pass 1: format + lead-time validation only (no conflict check yet)
    for (const seg of segs) {
      const resourceNumber = Number(seg.resource);
      const startHour = Number(seg.startHour);
      const endHour = Number(seg.endHour);

      if (![resourceNumber, startHour, endHour].every(Number.isFinite)) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", issues: [{ path: ["segments"], message: "Segments muszą mieć resource/startHour/endHour." }] },
          { status: 400 }
        );
      }

      const startsAt = toDateAtHour(data.date, startHour);
      const endsAt = toDateAtHour(data.date, endHour + 1);

      if (endsAt <= startsAt) {
        return NextResponse.json(
          { error: "VALIDATION_ERROR", issues: [{ path: ["segments"], message: "Koniec musi być po początku." }] },
          { status: 400 }
        );
      }

      if (!isSlotBookableWithLeadTime(data.date, startHour, 0, 15)) {
        return NextResponse.json(
          { error: "NO_AVAILABILITY", issues: [{ path: ["segments"], message: "Nie można rezerwować godzin, które już minęły lub zaczynają się za mniej niż 15 minut." }] },
          { status: 409 }
        );
      }

      // Godziny otwarcia per segment (w tym reservation_start_after_opening_minutes dla bilardu)
      if (oc) {
        const segStart = toDateAtHour(data.date, startHour)
        const earliestStart = addMinutes(oc.openAt, reservationStartAfterOpeningMinutes)
        const latestStart = addMinutes(oc.closeAt, -latestReservationStartBeforeClosingMinutes)
        if (segStart < earliestStart || segStart > latestStart) {
          return NextResponse.json(
            { error: "OUT_OF_HOURS", message: "Wybrany czas jest poza godzinami dostępności." },
            { status: 409 }
          )
        }
      }

      // blocksVenue per segment (obsługuje endHour=0 = północ)
      if (isSlotBlockedByVenueEvent(venueBlockingEvents, Math.floor(startHour), Math.round((startHour % 1) * 60))) {
        return NextResponse.json(
          { error: "VENUE_BLOCKED", message: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie." },
          { status: 409 }
        )
      }

      const resourceId = numToId.get(resourceNumber)!;
      const hours = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60);
      toCreate.push({ resourceNumber, resourceId, startsAt, endsAt, segmentPrice: hours * pricePerHour });
    }

    const groupId = (globalThis.crypto as any)?.randomUUID?.() ?? String(Date.now());
    const amountToPay = toCreate.reduce((acc, x) => acc + x.segmentPrice, 0);
    const amountGrosze = Math.round(amountToPay * 100);

    // Advisory lock per resource+day — sortujemy resourceId ASC żeby uniknąć deadlocków
    const sortedResourceIds = [...new Set(toCreate.map(s => s.resourceId))].sort();
    let lockClient: any = null;
    const acquiredLockKeys: string[] = [];
    try {
      const dbPool = (payload.db as any)?.pool;
      if (!dbPool?.connect) throw new Error("DB pool unavailable");
      lockClient = await dbPool.connect();
      for (const resourceId of sortedResourceIds) {
        const lk = `bilard|${data.date}|resource:${resourceId}`;
        await lockClient.query(`SELECT pg_advisory_lock(hashtext($1))`, [lk]);
        acquiredLockKeys.push(lk);
      }
    } catch (lockErr) {
      console.error("[bilard] advisory lock error:", lockErr);
      if (lockClient) {
        for (const k of acquiredLockKeys) {
          await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [k]).catch(() => {});
        }
        lockClient.release();
      }
      return NextResponse.json(
        { error: "SERVICE_UNAVAILABLE", message: "Nie udało się potwierdzić dostępności. Spróbuj ponownie za chwilę." },
        { status: 503 }
      );
    }

    try {
      // Pass 2: fresh conflict check inside lock
      const [bResLocked, existingLocked] = await Promise.all([
        payload.find({
          collection: "blackouts",
          limit: 500,
          where: {
            and: [
              { active: { equals: true } },
              { service: { equals: service } },
              { day: { greater_than_equal: startOfDay(data.date).toISOString() } },
              { day: { less_than_equal: endOfDay(data.date).toISOString() } },
            ],
          },
        }),
        payload.find({
          collection: "reservations",
          limit: 2000,
          where: {
            and: [
              { type: { equals: "bilard" } },
              { status: { in: ["new", "confirmed"] } },
              {
                or: [
                  { day: { equals: dayISO } },
                  {
                    and: [
                      { day: { exists: false } },
                      { startsAt: { less_than: dayEndISO } },
                      { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than: dayStartISO } }] },
                    ],
                  },
                ],
              },
              // wyklucz wygasłe oczekujące na płatność
              {
                or: [
                  { paymentStatus: { not_equals: "pending" } },
                  { expiresAt: { exists: false } },
                  { expiresAt: { greater_than_equal: new Date().toISOString() } },
                ],
              } as any,
              // wyklucz własną sesję (replaceSessionId) — atomowy swap bez race window
              ...(replaceSessionId ? [{ groupId: { not_equals: replaceSessionId } }] : []) as any[],
            ],
          },
        }),
      ]);

      for (const item of toCreate) {
        const { resourceNumber, resourceId, startsAt, endsAt } = item;

        const blocked = (bResLocked.docs || []).some((b: any) => {
          const ids = relIds(b.resources);
          if (!ids.includes(resourceId)) return false;
          const range = blackoutRange(data.date, b);
          if (!range) return false;
          return overlaps(range.s, range.e, startsAt, endsAt);
        });

        if (blocked) {
          return NextResponse.json(
            { error: "NO_AVAILABILITY", issues: [{ path: ["segments"], message: `Zasób ${resourceNumber} jest zablokowany (blackout).` }] },
            { status: 409 }
          );
        }

        const busy = (existingLocked.docs || []).some((r: any) => {
          const rr = relIds(r.resources);
          if (!rr.includes(resourceId)) return false;
          const rSegs = Array.isArray(r.segments) ? r.segments as any[] : [];
          if (rSegs.length > 0) {
            return rSegs.some((seg: any) => {
              const segResId = String(typeof seg.resource === "object" ? (seg.resource?.id ?? seg.resource) : (seg.resource ?? ""));
              if (segResId !== resourceId) return false;
              const segStart = toDateAtHourMinute(data.date, Number(seg.startHour ?? 0), Number(seg.startMinute ?? 0));
              const segEnd = toDateAtHourMinute(data.date, Number(seg.endHour ?? 0), Number(seg.endMinute ?? 0));
              return overlaps(segStart, segEnd, startsAt, endsAt);
            });
          }
          const rStart = new Date(r.startsAt);
          const rEnd = r.endsAt ? new Date(r.endsAt) : endOfDay(data.date);
          return overlaps(rStart, rEnd, startsAt, endsAt);
        });

        if (busy) {
          return NextResponse.json(
            { error: "NO_AVAILABILITY", issues: [{ path: ["segments"], message: `Zasób ${resourceNumber} jest już zajęty.` }] },
            { status: 409 }
          );
        }
      }

      // Numer rezerwacji i rekord w bazie — PRZED P24
      const groupReservationNumber = await getNextReservationNumber(payload, "B");

      const dayISO2 = startOfLocalDayISO(toCreate[0].startsAt);
      const allResourceIds = toCreate.map(s => s.resourceId);
      const minStartsAt = toCreate.reduce((min, s) => s.startsAt < min ? s.startsAt : min, toCreate[0].startsAt);
      const maxEndsAt = toCreate.reduce((max, s) => s.endsAt > max ? s.endsAt : max, toCreate[0].endsAt);

      const segmentsData = toCreate.map(seg => ({
        resource: seg.resourceId,
        startHour: seg.startsAt.getHours(),
        startMinute: seg.startsAt.getMinutes(),
        endHour: seg.endsAt.getHours(),
        endMinute: seg.endsAt.getMinutes(),
        price: seg.segmentPrice,
      }));

      const createdDoc = await payload.create({
        collection: "reservations",
        data: {
          type: "bilard",
          day: dayISO2,
          groupId,
          reservationNumber: groupReservationNumber,
          customer: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, email: data.email },
          notes: data.notes || "",
          startsAt: minStartsAt.toISOString(),
          endsAt: maxEndsAt.toISOString(),
          startHour: minStartsAt.getHours(),
          startMinute: minStartsAt.getMinutes(),
          endHour: maxEndsAt.getHours(),
          endMinute: maxEndsAt.getMinutes(),
          resources: allResourceIds,
          segments: segmentsData,
          invoice: { wantInvoice: data.wantInvoice, invoiceType: (data as any).invoiceType || undefined, nip: data.nip || "" },
          acceptRules: data.acceptRules,
          source: "online",
          status: "new",
          depositRequired: amountToPay > 0,
          depositAmount: amountToPay,
          paymentStatus: amountGrosze > 0 ? "pending" : "not_required",
          paymentProvider: amountGrosze > 0 ? "p24" : undefined,
          expiresAt: amountGrosze > 0 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : undefined,
        } as any,
      });

      // P24 po zapisie rezerwacji
      let p24PayUrl: string | null = null;
      let replaceConflict: string | null = null;
      let createdPaymentId: number | null = null;
      if (amountGrosze > 0) {
        console.log(`[bilard] P24_REGISTER_STARTED reservationNumber=${groupReservationNumber} groupId=${groupId} amount=${amountGrosze}`);
        try {
          const { payUrl } = await registerTransaction({
            sessionId: groupId,
            amount: amountGrosze,
            description: `Rezerwacja ${groupReservationNumber}`,
            email: data.email,
          });
          p24PayUrl = payUrl;
          console.log(`[bilard] P24_REGISTER_OK reservationNumber=${groupReservationNumber} groupId=${groupId}`);

          // Utwórz pending payment PRZED redirectem — sentinel chroniący przed cancel race
          try {
            const createdPayment = await payload.create({
              collection: "payments",
              overrideAccess: true,
              data: {
                provider: "p24",
                status: "pending",
                amount: amountGrosze / 100,
                currency: "PLN",
                p24SessionId: groupId,
                reservation: createdDoc.id,
              } as any,
            });
            createdPaymentId = createdPayment.id;
            console.log(`[bilard] PAYMENT_RECORD_CREATED reservationNumber=${groupReservationNumber} groupId=${groupId} amount=${amountGrosze / 100}`);
            await payload.update({ collection: "reservations", id: createdDoc.id, overrideAccess: true, context: { skipConflictCheck: true } as any, data: { payment: createdPayment.id } as any }).catch(() => {});
          } catch (payErr: any) {
            console.error(`[bilard] PAYMENT_RECORD_CREATE_FAILED reservationNumber=${groupReservationNumber} groupId=${groupId}:`, payErr?.message);
          }

          // Re-lock + fresh read przed wygaszeniem starej sesji
          if (replaceSessionId) {
            const expireResult = await tryPaymentLock(payload, replaceSessionId, async () => {
              const [freshResResult, freshPmtResult] = await Promise.all([
                payload.find({
                  collection: "reservations",
                  limit: 10,
                  overrideAccess: true,
                  where: {
                    and: [
                      { groupId: { equals: replaceSessionId } },
                      { type: { equals: "bilard" } },
                    ],
                  },
                }),
                payload.find({
                  collection: "payments",
                  limit: 1,
                  overrideAccess: true,
                  where: { p24SessionId: { equals: replaceSessionId } },
                }),
              ])
              const pmt = (freshPmtResult.docs[0] as any) ?? null
              const pmtBlocked = pmt && (pmt.status === "paid" || pmt.status === "refunded")
              const resBlocked = (freshResResult.docs as any[]).some(
                r => r.paymentStatus === "paid" || r.paymentStatus === "verifying" || r.status === "confirmed"
              )
              if (pmtBlocked || resBlocked) {
                return { conflict: pmtBlocked ? "payment_paid" : "reservation_blocked" } as const
              }
              const nowISO = new Date().toISOString()
              let expiredCount = 0
              for (const oldDoc of freshResResult.docs as any[]) {
                if (oldDoc.paymentStatus === "pending") {
                  try {
                    await payload.update({
                      collection: "reservations",
                      id: oldDoc.id,
                      overrideAccess: true,
                      data: { expiresAt: nowISO } as any,
                    })
                    expiredCount++
                  } catch (perErr: any) {
                    console.error(`[bilard] REPLACE_EXPIRE_DOC_FAILED id=${oldDoc.id}:`, perErr?.message)
                  }
                }
              }
              return { ok: true as const, expiredCount }
            })

            if (expireResult === null) {
              console.error(`[bilard] CRITICAL REPLACE_EXPIRE_LOCK_UNAVAILABLE replaceSessionId=${replaceSessionId} oldId=${oldReservationId} newId=${createdDoc.id} newRN=${groupReservationNumber} — callback aktywny podczas wygaszenia`)
              replaceConflict = "lock_unavailable"
            } else if ("conflict" in expireResult) {
              console.error(`[bilard] CRITICAL REPLACE_PAID_DURING_SWAP replaceSessionId=${replaceSessionId} oldId=${oldReservationId} conflict=${expireResult.conflict} newId=${createdDoc.id} newRN=${groupReservationNumber} — stara sesja opłacona podczas swapa, manual review needed`)
              replaceConflict = expireResult.conflict
            } else {
              console.log(`[bilard] REPLACE_OLD_EXPIRED replaceSessionId=${replaceSessionId} oldId=${oldReservationId} count=${expireResult.expiredCount} newId=${createdDoc.id} newRN=${groupReservationNumber}`)
            }
          }
        } catch (p24Err) {
          console.error(`[bilard] P24_REGISTER_FAILED reservationNumber=${groupReservationNumber} groupId=${groupId}:`, p24Err);
          await payload.update({
            collection: "reservations",
            id: createdDoc.id,
            overrideAccess: true,
            data: { status: "cancelled", paymentStatus: "failed", cancellationReason: "payment_failed" } as any,
          }).catch((e) => console.error("[bilard] rollback update failed:", e));
          return NextResponse.json({ error: "PAYMENT_ERROR", message: CONTACT_MSG }, { status: 502 });
        }
      }

      console.log(`[bilard] PAYMENT_RESERVATION_CREATED reservationId=${createdDoc.id} reservationNumber=${groupReservationNumber} p24=${!!p24PayUrl} groupId=${groupId}`);

      if (replaceConflict) {
        const abandonNow = new Date().toISOString()
        let resExpired = false
        let pmtMarkedFailed = false
        try {
          await payload.update({
            collection: "reservations",
            id: createdDoc.id,
            overrideAccess: true,
            data: { expiresAt: abandonNow, status: "cancelled", paymentStatus: "failed", cancellationReason: "cancelled_by_system" } as any,
          })
          resExpired = true
        } catch (e: any) {
          console.error(`[bilard] CRITICAL REPLACE_CONFLICT_EXPIRE_FAILED newId=${createdDoc.id} — slot NIE zwolniony, fallback expiresAt=${(createdDoc as any).expiresAt ?? "brak"}:`, e?.message)
        }
        if (createdPaymentId !== null) {
          try {
            await payload.update({
              collection: "payments",
              id: createdPaymentId,
              overrideAccess: true,
              data: { status: "failed" } as any,
            })
            pmtMarkedFailed = true
          } catch (e: any) {
            console.error(`[bilard] CRITICAL REPLACE_CONFLICT_PAYMENT_FAILED pmtId=${createdPaymentId}:`, e?.message)
          }
        }
        if (resExpired) {
          console.error(`[bilard] CRITICAL REPLACE_CONFLICT_NEW_ABANDONED newId=${createdDoc.id} newRN=${groupReservationNumber} newPmtId=${createdPaymentId ?? "none"} pmtFailed=${pmtMarkedFailed} p24SessionId=${groupId} replaceConflict=${replaceConflict} — slot zwolniony natychmiast`)
        } else {
          console.error(`[bilard] CRITICAL REPLACE_CONFLICT_SLOT_NOT_FREED newId=${createdDoc.id} newRN=${groupReservationNumber} newPmtId=${createdPaymentId ?? "none"} p24SessionId=${groupId} replaceConflict=${replaceConflict} — slot NIE zwolniony, fallback expiresAt=${(createdDoc as any).expiresAt ?? "brak"}`)
        }
        return NextResponse.json({
          error: replaceConflict === "lock_unavailable" ? "REPLACE_BUSY" : "REPLACE_PAID_DURING_SWAP",
          message: replaceConflict === "lock_unavailable"
            ? "Poprzednia płatność jest właśnie weryfikowana. Odczekaj chwilę i sprawdź e-mail."
            : "Twoja poprzednia płatność właśnie się powiodła. Sprawdź e-mail z potwierdzeniem rezerwacji.",
        }, { status: 409 })
      }

      if (p24PayUrl) {
        return NextResponse.json({ ok: true, redirectUrl: p24PayUrl, groupId });
      }
      return NextResponse.json({ ok: true, groupId, reservationIds: [createdDoc.id], amountToPay });

    } finally {
      if (lockClient) {
        for (const k of acquiredLockKeys) {
          await lockClient.query(`SELECT pg_advisory_unlock(hashtext($1))`, [k]).catch(() => {});
        }
        lockClient.release();
      }
    }
  }

  // STARE FLOW
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 }
    );
  }

  const startsAt = toDateAtHour(data.date, data.startHour);
  const endsAt = toDateAtHour(data.date, (data.endHour ?? 0) + 1);

  {
    const startH = Math.floor(data.startHour ?? 0);
    const startMn = Math.round(((data.startHour ?? 0) % 1) * 60);
    if (!isSlotBookableWithLeadTime(data.date, startH, startMn, 15)) {
      return NextResponse.json(
        { error: "NO_AVAILABILITY", issues: [{ path: ["startHour"], message: "Nie można rezerwować godzin, które już minęły lub zaczynają się za mniej niż 15 minut." }] },
        { status: 409 }
      );
    }
  }

  const found = await payload.find({
    collection: "resources",
    limit: 200,
    where: { and: [{ type: { equals: rType } }, { number: { in: data.resources } }, { active: { equals: true } }] },
  });

  const resourceIds = found.docs.map((d: any) => String(d.id));
  if (!resourceIds.length || resourceIds.length !== data.resources.length) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", issues: [{ path: ["resources"], message: "Nie znaleziono wszystkich zasobów." }] },
      { status: 400 }
    );
  }

  const isBlocked = (bRes.docs || []).some((b: any) => {
    const ids = relIds(b.resources);
    const touchesAny = ids.some((id) => resourceIds.includes(id));
    if (!touchesAny) return false;

    if (b.allDay) return true;

    const startH = Number(b.startHour);
    const startM = Number(b.startMinute ?? 0);
    const endH = Number(b.endHour);
    const endM = Number(b.endMinute ?? 0);

    if ([startH, startM, endH, endM].some((x) => Number.isNaN(x))) return false;

    const bStart = toDateAtHourMinute(data.date, startH, startM);
    const bEnd = toDateAtHourMinute(data.date, endH, endM);

    return overlaps(bStart, bEnd, startsAt, endsAt);
  });

  if (isBlocked) {
    return NextResponse.json(
      { error: "NO_AVAILABILITY", issues: [{ path: ["resources"], message: "Wybrane zasoby są zablokowane (blackout)." }] },
      { status: 409 }
    );
  }

  const reserved = new Set<string>();
  for (const r of existing.docs || []) {
    const rr = relIds((r as any).resources);
    const rStart = new Date((r as any).startsAt);
    const rEnd = (r as any).endsAt ? new Date((r as any).endsAt) : endOfDay(data.date); // ✅ FIX
    if (overlaps(rStart, rEnd, startsAt, endsAt)) rr.forEach((id) => reserved.add(id));
  }

  if (resourceIds.some((id) => reserved.has(id))) {
    return NextResponse.json(
      { error: "NO_AVAILABILITY", issues: [{ path: ["resources"], message: "Wybrane zasoby są już zajęte w tym terminie." }] },
      { status: 409 }
    );
  }

  const amountToPay = data.totalPrice ?? 0;
  const dayISO2 = startOfLocalDayISO(startsAt);

  const reservationDoc = await payload.create({
    collection: "reservations",
    data: {
      type: "bilard",
      day: dayISO2,

      customer: { firstName: data.firstName, lastName: data.lastName, phone: data.phone, email: data.email },
      notes: data.notes || "",

      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),

      startHour: startsAt.getHours(),
      startMinute: startsAt.getMinutes(),
      endHour: endsAt.getHours(),
      endMinute: endsAt.getMinutes(),

      resources: resourceIds,
      invoice: { wantInvoice: data.wantInvoice, invoiceType: (data as any).invoiceType || undefined, nip: data.nip || "" },
      acceptRules: data.acceptRules,

      source: "online",
      status: "new",

      depositRequired: amountToPay > 0,
      depositAmount: amountToPay > 0 ? amountToPay : 0,
      paymentStatus: amountToPay > 0 ? "pending" : "not_required",
      paymentProvider: amountToPay > 0 ? "p24" : undefined,
    } as any,
  });

  return NextResponse.json({ ok: true, reservationId: reservationDoc.id });

  } catch (e: any) {
    const msg: string = e?.message ?? String(e)
    if (msg.includes("zarezerwowany w tym czasie") || msg.startsWith("Kolizja")) {
      return NextResponse.json(
        { error: "NO_AVAILABILITY", message: "Wybrany stół jest już zajęty w tym terminie. Odśwież stronę i wybierz inny czas." },
        { status: 409 }
      )
    }
    console.error("[bilard] POST nieoczekiwany błąd:", msg)
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: CONTACT_MSG },
      { status: 500 }
    )
  }
}
