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
import { getBlockingEvent } from "@/lib/openingHours";

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
 * GET /api/reservations/kregle?date=YYYY-MM-DD
 */
export async function GET(req: Request) {
  const payload = await getPayload({ config });
  const { searchParams } = new URL(req.url);

  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ ok: false, error: "MISSING_DATE" }, { status: 400 });

  const settings = await payload.findGlobal({ slug: "reservation-settings" });
  const s = settings?.bowling ?? {};

  const enabled = Boolean(s?.enabled);
  const disabledMessage = s?.disabledMessage ?? null;
  const pricePerHour = Number(s?.pricePerHour ?? 120);

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

  // Lokal zablokowany przez wydarzenie
  const blockCheck = await getBlockingEvent(date);
  if (blockCheck.blocked) {
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

  const oc = openingHours.length ? getOpenCloseForDay({ date, openingHours }) : null;

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

  const rType = resourceTypeForReservation("kregle");
  const service = mapServiceForBlackout("kregle");
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

  // ✅ FIX: filtruj po day (i fallback na stare rekordy bez day)
  const existing = await payload.find({
    collection: "reservations",
    limit: 2000,
    where: {
      and: [
        { type: { equals: "kregle" } },
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

  // ✅ past-slots gate (Europe/Warsaw, 15-min lead time)
  function statusForSlot(args: { slotStart: Date; slotEnd: Date; resourceId: string; slotHour: number; slotMinute: number }): CellStatus {
    if (!enabled) return "blocked";
    if (!isSlotBookableWithLeadTime(date, args.slotHour, args.slotMinute, 15)) return "blocked";

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
 * POST /api/reservations/kregle
 * segments[] -> jeden rekord w reservations z wszystkimi torami w resources[]
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

  if (data.type !== "kregle") {
    return NextResponse.json(
      { error: "BAD_TYPE", issues: [{ path: ["type"], message: "Ten endpoint obsługuje tylko kręgle." }] },
      { status: 400 }
    );
  }

  const settings = await payload.findGlobal({ slug: "reservation-settings" });
  const s = settings?.bowling ?? {};

  if (!s?.enabled) {
    return NextResponse.json(
      { error: "RESERVATIONS_DISABLED", message: s?.disabledMessage ?? "Rezerwacje kręgli są obecnie wyłączone." },
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

  if (typeof data?.date === "string") {
    const startH = typeof data?.startHour === "number" ? data.startHour : undefined
    const blockCheck = await getBlockingEvent(data.date, startH != null ? Math.trunc(startH) : undefined)
    if (blockCheck.blocked) {
      return NextResponse.json(
        { error: "VENUE_BLOCKED", message: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie." },
        { status: 409 }
      )
    }
  }

  const rType = resourceTypeForReservation("kregle");
  const service = mapServiceForBlackout("kregle");
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
        { type: { equals: "kregle" } },
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

    const pricePerHour = Number(s?.pricePerHour ?? 120);

    const toCreate: Array<{
      resourceNumber: number;
      resourceId: string;
      startsAt: Date;
      endsAt: Date;
      segmentPrice: number;
    }> = [];

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

      const resourceId = numToId.get(resourceNumber)!;

      const blocked = (bRes.docs || []).some((b: any) => {
        const ids = relIds(b.resources);
        if (!ids.includes(resourceId)) return false;

        const range = blackoutRange(data.date, b);
        if (!range) return false;

        return overlaps(range.s, range.e, startsAt, endsAt);
      });

      if (blocked) {
        return NextResponse.json(
          { error: "NO_AVAILABILITY", issues: [{ path: ["segments"], message: `Tor ${resourceNumber} jest zablokowany (blackout).` }] },
          { status: 409 }
        );
      }

      const busy = (existing.docs || []).some((r: any) => {
        const rr = relIds(r.resources);
        if (!rr.includes(resourceId)) return false;

        const rSegs = Array.isArray(r.segments) ? r.segments as any[] : [];
        if (rSegs.length > 0) {
          return rSegs.some((seg: any) => {
            const segResId = String(typeof seg.resource === "object" ? (seg.resource?.id ?? seg.resource) : (seg.resource ?? ""))
            if (segResId !== resourceId) return false
            const segStart = toDateAtHourMinute(data.date, Number(seg.startHour ?? 0), Number(seg.startMinute ?? 0))
            const segEnd = toDateAtHourMinute(data.date, Number(seg.endHour ?? 0), Number(seg.endMinute ?? 0))
            return overlaps(segStart, segEnd, startsAt, endsAt)
          })
        }

        const rStart = new Date(r.startsAt);
        const rEnd = r.endsAt ? new Date(r.endsAt) : endOfDay(data.date); // ✅ FIX
        return overlaps(rStart, rEnd, startsAt, endsAt);
      });

      if (busy) {
        return NextResponse.json(
          { error: "NO_AVAILABILITY", issues: [{ path: ["segments"], message: `Tor ${resourceNumber} jest już zajęty.` }] },
          { status: 409 }
        );
      }

      const hours = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60);
      const segmentPrice = hours * pricePerHour;

      toCreate.push({ resourceNumber, resourceId, startsAt, endsAt, segmentPrice });
    }

    const groupId = (globalThis.crypto as any)?.randomUUID?.() ?? String(Date.now());
    const amountToPay = toCreate.reduce((acc, x) => acc + x.segmentPrice, 0);
    const amountGrosze = Math.round(amountToPay * 100);

    // Jeden numer rezerwacji na całą grupę (wszystkie tory = jedna rezerwacja klienta)
    const groupReservationNumber = await getNextReservationNumber(payload, "K");

    // Rejestracja transakcji P24 PRZED zapisem do bazy
    let p24PayUrl: string | null = null;
    if (amountGrosze > 0) {
      try {
        const { payUrl } = await registerTransaction({
          sessionId: groupId,
          amount: amountGrosze,
          description: `Rezerwacja ${groupReservationNumber}`,
          email: data.email,
        });
        p24PayUrl = payUrl;
      } catch (err) {
        console.error("[kregle] P24 register error:", err);
        return NextResponse.json(
          { error: "PAYMENT_ERROR", message: CONTACT_MSG },
          { status: 502 }
        );
      }
    }

    console.log(`[kregle] P24 payUrl=${p24PayUrl} groupId=${groupId}`)

    // Jeden rekord dla całej rezerwacji, segmenty per tor wewnątrz
    const dayISO2 = startOfLocalDayISO(toCreate[0].startsAt)
    const allResourceIds = toCreate.map(s => s.resourceId)
    const minStartsAt = toCreate.reduce((min, s) => s.startsAt < min ? s.startsAt : min, toCreate[0].startsAt)
    const maxEndsAt = toCreate.reduce((max, s) => s.endsAt > max ? s.endsAt : max, toCreate[0].endsAt)

    const segmentsData = toCreate.map(seg => ({
      resource: seg.resourceId,
      startHour: seg.startsAt.getHours(),
      startMinute: seg.startsAt.getMinutes(),
      endHour: seg.endsAt.getHours(),
      endMinute: seg.endsAt.getMinutes(),
      price: seg.segmentPrice,
    }))

    const createdDoc = await payload.create({
      collection: "reservations",
      data: {
        type: "kregle",
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
      } as any,
    })

    if (p24PayUrl) {
      return NextResponse.json({ ok: true, redirectUrl: p24PayUrl, groupId });
    }

    return NextResponse.json({ ok: true, groupId, reservationIds: [createdDoc.id], amountToPay });
  }

  // stare flow
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
    const blackoutResourceIds = relIds(b.resources);
    const touchesAny = blackoutResourceIds.some((id) => resourceIds.includes(id));
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
      { error: "NO_AVAILABILITY", issues: [{ path: ["resources"], message: "Wybrane tory są zablokowane (blackout)." }] },
      { status: 409 }
    );
  }

  const reservedIds = new Set<string>();
  for (const r of existing.docs || []) {
    const rr = relIds((r as any).resources);
    const rStart = new Date((r as any).startsAt);
    const rEnd = (r as any).endsAt ? new Date((r as any).endsAt) : endOfDay(data.date); // ✅ FIX

    if (overlaps(rStart, rEnd, startsAt, endsAt)) rr.forEach((id) => reservedIds.add(id));
  }

  if (resourceIds.some((id) => reservedIds.has(id))) {
    return NextResponse.json(
      { error: "NO_AVAILABILITY", issues: [{ path: ["resources"], message: "Wybrane tory są już zajęte w tym terminie." }] },
      { status: 409 }
    );
  }

  const amountToPay = data.totalPrice ?? 0;
  const dayISO2 = startOfLocalDayISO(startsAt);

  const reservationDoc = await payload.create({
    collection: "reservations",
    data: {
      type: "kregle",
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
      invoice: { wantInvoice: data.wantInvoice, nip: data.nip || "" },
      acceptRules: data.acceptRules,

      source: "online",
      status: "new",

      depositRequired: amountToPay > 0,
      depositAmount: amountToPay > 0 ? amountToPay : 0,
      paymentStatus: amountToPay > 0 ? "pending" : "not_required",
      paymentProvider: amountToPay > 0 ? "p24" : undefined,
    } as any,
  });

  return NextResponse.json({
    ok: true,
    reservationId: reservationDoc.id,
    paymentId: null,
  });

  } catch (e: any) {
    console.error("[kregle] POST nieoczekiwany błąd:", e?.message ?? e)
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: CONTACT_MSG },
      { status: 500 }
    )
  }
}
