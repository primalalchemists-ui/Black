// src/collections/Reservations.ts
import type { CollectionConfig } from "payload";
import { expectedResourceTypeByReservationType } from "@/lib/resourceFilters";
import type { ReservationType } from "@/lib/resourceFilters";

const isStaffOrAdmin = ({ req }: any) => ["admin", "staff"].includes(req.user?.role);

const hourOptions = Array.from({ length: 24 }, (_, h) => ({
  label: `${String(h).padStart(2, "0")}:00`,
  value: String(h),
}));

const minuteOptions = [
  { label: "00", value: "0" },
  { label: "15", value: "15" },
  { label: "30", value: "30" },
  { label: "45", value: "45" },
];

function clampPartySize(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.min(16, Math.max(1, Math.floor(x)));
}

/**
 * ✅ UTC-stabilne ISO z pola day + hour + minute
 */
function buildDateTimeFromDayHourMinuteUTC(day: string | Date, hourStr: string, minuteStr: string) {
  const base = new Date(day);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();

  const h = Number(hourStr);
  const min = Number(minuteStr);

  const utc = new Date(Date.UTC(y, m, d, h, min, 0, 0));
  return utc.toISOString();
}

// =======================
// ✅ ANTI-OVERLAP + PAST GUARDS
// =======================

const IGNORED_STATUSES = ["cancelled", "no_show", "completed"] as const;

// UWAGA: completed traktujemy jako "historyczne" i NIE blokujemy (dla staff/admin)
// Jeśli chcesz jednak też blokować completed, usuń go z logiki poniżej.
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

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

export const Reservations: CollectionConfig = {
  slug: "reservations",
  labels: { singular: "Rezerwacja", plural: "Rezerwacje" },

  admin: {
    group: "Obsługa",
    useAsTitle: "reservationNumber",
    disableDuplicate: true,
    defaultColumns: ["type", "startsAt", "status", "customer.phone", "paymentStatus"],
    components: {
      views: {
        list: {
          Component: '@/components/admin/ReservationsListView#ReservationsListView',
        },
      },
    },
  },

  access: {
    read: isStaffOrAdmin,
    create: () => true,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === "admin",
  },

  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const type = data?.type as ReservationType | undefined;
        if (!data || !type) return data;

        // Czyścimy pola, które nie pasują do typu
        if (type !== "stolik" && type !== "impreza" && type !== "biznes") {
          delete (data as any).partySize;
          delete (data as any).tablesCount;
        }
        if (type !== "kregle" && type !== "bilard") {
          delete (data as any).resources;
        }
        if (type !== "biznes" && type !== "impreza") {
          delete (data as any).event;
          delete (data as any).disabledPerson;
          delete (data as any).disabilityDetails;
        }

        // dla stolików: klampuj partySize, tablesCount = 1 (nie liczymy już per-stolik)
        if (type === "stolik") {
          const ps = clampPartySize((data as any).partySize ?? 1);
          (data as any).partySize = ps;
          (data as any).tablesCount = 1;
        }

        // ===== USTAWIANIE startsAt/endsAt z UI pól (day + time) =====
        if ((data as any).day) {
          const day = (data as any).day as any;
          const allDay = Boolean((data as any).allDay);

          if (allDay) {
            const start = new Date(day);
            start.setUTCHours(0, 0, 0, 0);

            const end = new Date(day);
            end.setUTCHours(23, 59, 59, 999);

            (data as any).startsAt = start.toISOString();
            (data as any).endsAt = end.toISOString();
          } else {
            const startHour = String((data as any).startHour ?? "0");
            const startMinute = String((data as any).startMinute ?? "0");

            const endHour = (data as any).endHour != null ? String((data as any).endHour) : "";
            const endMinute = (data as any).endMinute != null ? String((data as any).endMinute) : "";

            (data as any).startsAt = buildDateTimeFromDayHourMinuteUTC(day, startHour, startMinute);

            if (endHour !== "" && endMinute !== "") {
              const endsAtIso = buildDateTimeFromDayHourMinuteUTC(day, endHour, endMinute);

              const startD = new Date((data as any).startsAt);
              const endD = new Date(endsAtIso);

              if (endD <= startD) {
                // overnight event (e.g. 22:00 – 02:00) — push end to next day
                endD.setDate(endD.getDate() + 1);
              }

              (data as any).endsAt = endD.toISOString();
            } else {
              (data as any).endsAt = undefined;
            }
          }
        }

        // ===== AUTO-GENERACJA SEGMENTÓW Z PANELU ADMINA =====
        // Dla rezerwacji przez panel (req.user istnieje): zawsze regeneruj segmenty
        // z top-level pól startHour/endHour + resources. startsAt/endsAt już obliczone
        // przez blok powyżej.
        // Dla rezerwacji online (brak req.user): segments przychodzą gotowe z route,
        // startsAt/endsAt też ustawione przez route — nie ingerujemy.
        if (req?.user && (type === "kregle" || type === "bilard")) {
          const rawResources = (data as any).resources;
          const resources = Array.isArray(rawResources)
            ? (rawResources as any[])
                .map((x: any) => {
                  if (!x) return null;
                  if (typeof x === "string" || typeof x === "number") return String(x);
                  if (x?.id != null) return String(x.id);
                  if (x?.value != null) return String(x.value);
                  return null;
                })
                .filter(Boolean) as string[]
            : [];

          if (resources.length > 0) {
            const sH = Number((data as any).startHour ?? 0);
            const sM = Number((data as any).startMinute ?? 0);
            const eH = Number((data as any).endHour ?? 0);
            const eM = Number((data as any).endMinute ?? 0);

            if (Number.isFinite(sH) && Number.isFinite(eH)) {
              (data as any).segments = resources.map((resourceId: string) => ({
                resource: resourceId,
                startHour: sH,
                startMinute: sM,
                endHour: eH,
                endMinute: eM,
                price: 0,
              }));
            }
          }
        }

        return data;
      },
    ],

    // ✅ BLOKADA KOLIZJI + BLOKADA PRZESZŁOŚCI (działa też w panelu)
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        // Skip conflict check for payment-only updates (triggered by Payments.afterChange hook).
        // These updates don't change time/resource fields so no conflict can arise,
        // and running req.payload.find here would exhaust the DB connection pool.
        if ((req.context as any)?.skipConflictCheck) return data;

        const incoming: any = data || {};
        const type = String(incoming.type ?? originalDoc?.type ?? "");
        const status = String(incoming.status ?? originalDoc?.status ?? "");

        // 1) interesuje nas tylko bilard/kręgle
        if (type !== "kregle" && type !== "bilard") return data;

        // 2) ignoruj statusy, które nie blokują dostępności
        if (IGNORED_STATUSES.includes(status as any)) return data;

        const startsAtStr = String(incoming.startsAt ?? originalDoc?.startsAt ?? "");
        const endsAtStr = String(incoming.endsAt ?? originalDoc?.endsAt ?? "");
        if (!startsAtStr || !endsAtStr) return data;

        const startsAt = new Date(startsAtStr);
        const endsAt = new Date(endsAtStr);
        if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime())) return data;

        // 3) BLOKADA PRZESZŁOŚCI
        const isStaff = ["admin", "staff"].includes(req.user?.role);
        const now = new Date();
        const allowPastBecauseCompleted = isStaff && status === "completed";
        const mustBlockPast = !allowPastBecauseCompleted && startsAt.getTime() < now.getTime();
        if (mustBlockPast) {
          throw new Error("Nie można tworzyć rezerwacji w przeszłości.");
        }

        // 4) zasoby
        const resources = relIds(incoming.resources ?? originalDoc?.resources);
        if (!resources.length) return data;

        // 5) pomiń samego siebie przy update
        const idToIgnore = operation === "update" ? String(originalDoc?.id) : null;

        // 6) pobierz kandydatów (tylko te, które czasowo mogą kolidować)
        const candidates = await req.payload.find({
          collection: "reservations",
          limit: 2000,
          where: {
            and: [
              { type: { equals: type } },
              { status: { not_in: [...IGNORED_STATUSES] } as any },
              { startsAt: { less_than: endsAt.toISOString() } },
              { endsAt: { greater_than: startsAt.toISOString() } },
              ...(idToIgnore ? [{ id: { not_equals: idToIgnore } }] : []),
              // wyklucz wygasłe oczekujące na płatność
              {
                or: [
                  { paymentStatus: { not_equals: "pending" } },
                  { expiresAt: { exists: false } },
                  { expiresAt: { greater_than_equal: now.toISOString() } },
                ],
              } as any,
            ],
          },
        });

        // 7) Sprawdź kolizje — per-segment jeśli rezerwacja ma segmenty per zasób,
        //    inaczej top-level. Segment-level jest konieczny, bo kilka stołów/torów
        //    może mieć różne godziny w jednej rezerwacji — span całej rezerwacji
        //    byłby zbyt szeroki i powodował fałszywe kolizje.

        function getResId(val: any): string {
          if (!val) return "";
          if (typeof val === "string" || typeof val === "number") return String(val);
          if (val?.id != null) return String(val.id);
          if (val?.value != null) {
            const v = val.value;
            if (typeof v === "string" || typeof v === "number") return String(v);
            if (v?.id != null) return String(v.id);
          }
          return "";
        }

        function segToDate(dayIso: any, hour: unknown, minute: unknown): Date {
          const base = new Date(dayIso);
          const y = base.getUTCFullYear();
          const m = base.getUTCMonth();
          const d = base.getUTCDate();
          return new Date(Date.UTC(y, m, d, Number(hour ?? 0), Number(minute ?? 0), 0, 0));
        }

        const incomingSegments: any[] = Array.isArray(incoming.segments)
          ? (incoming.segments as any[]).filter((s: any) => s?.resource != null)
          : [];
        const incomingDay = incoming.day ?? originalDoc?.day;

        if (incomingSegments.length > 0 && incomingDay) {
          // Segment-level collision check: per zasób, per przedział czasu
          const incomingByRes = new Map<string, Array<{ start: Date; end: Date }>>();
          for (const seg of incomingSegments) {
            const resId = getResId(seg.resource);
            if (!resId) continue;
            const start = segToDate(incomingDay, seg.startHour, seg.startMinute);
            const end = segToDate(incomingDay, seg.endHour, seg.endMinute);
            if (!incomingByRes.has(resId)) incomingByRes.set(resId, []);
            incomingByRes.get(resId)!.push({ start, end });
          }

          for (const r of (candidates.docs || []) as any[]) {
            const rStatus = String(r.status ?? "");
            if (IGNORED_STATUSES.includes(rStatus as any)) continue;

            const rSegs: any[] = Array.isArray(r.segments)
              ? (r.segments as any[]).filter((s: any) => s?.resource != null)
              : [];
            const rDay = r.day ?? r.startsAt;

            if (rSegs.length > 0 && rDay) {
              // Istniejąca rezerwacja też ma segmenty — porównaj per zasób
              for (const rSeg of rSegs) {
                const resId = getResId(rSeg.resource);
                const inTimes = incomingByRes.get(resId);
                if (!inTimes) continue;
                const rStart = segToDate(rDay, rSeg.startHour, rSeg.startMinute);
                const rEnd = segToDate(rDay, rSeg.endHour, rSeg.endMinute);
                for (const inTime of inTimes) {
                  if (overlaps(rStart, rEnd, inTime.start, inTime.end)) {
                    throw new Error("Wystąpiła kolizja z inną rezerwacją w tym terminie.");
                  }
                }
              }
            } else {
              // Istniejąca rezerwacja bez segmentów — top-level check per zasób
              const otherRes = relIds(r.resources);
              const rStart = new Date(r.startsAt);
              const rEnd = new Date(r.endsAt);
              for (const [resId, inTimes] of incomingByRes) {
                if (!otherRes.includes(resId)) continue;
                for (const inTime of inTimes) {
                  if (overlaps(rStart, rEnd, inTime.start, inTime.end)) {
                    throw new Error("Wystąpiła kolizja z inną rezerwacją w tym terminie.");
                  }
                }
              }
            }
          }
        } else {
          // Rezerwacja bez segmentów — stary check top-level
          for (const r of (candidates.docs || []) as any[]) {
            const rStatus = String(r.status ?? "");
            if (IGNORED_STATUSES.includes(rStatus as any)) continue;

            const otherResources = relIds(r.resources);
            const touchesSame = otherResources.some((id) => resources.includes(id));
            if (!touchesSame) continue;

            const rStart = new Date(r.startsAt);
            const rEnd = new Date(r.endsAt);
            if (isNaN(rStart.getTime()) || isNaN(rEnd.getTime())) continue;

            if (overlaps(rStart, rEnd, startsAt, endsAt)) {
              throw new Error("Wystąpiła kolizja z inną rezerwacją w tym terminie.");
            }
          }
        }

        // 8) Sprawdzenie aktywnych blokad dostępności
        const serviceForType = type === "kregle" ? "bowling" : "billiard";
        const base = new Date(startsAt);
        const y = base.getUTCFullYear(), mo = base.getUTCMonth(), d = base.getUTCDate();
        const dayStart = new Date(Date.UTC(y, mo, d, 0, 0, 0, 0)).toISOString();
        const dayEnd   = new Date(Date.UTC(y, mo, d, 23, 59, 59, 999)).toISOString();

        const blackouts = await req.payload.find({
          collection: "blackouts",
          limit: 200,
          overrideAccess: true,
          where: {
            and: [
              { service: { equals: serviceForType } },
              { active: { equals: true } },
              { day: { greater_than_equal: dayStart } },
              { day: { less_than_equal: dayEnd } },
            ],
          },
        });

        for (const b of blackouts.docs as any[]) {
          const bRes = relIds((b as any).resources);
          if (!resources.some((id) => bRes.includes(id))) continue;

          const bBase = new Date((b as any).day);
          const by = bBase.getUTCFullYear(), bmo = bBase.getUTCMonth(), bd = bBase.getUTCDate();
          const bAllDay = Boolean((b as any).allDay);
          const bStart = bAllDay
            ? new Date(Date.UTC(by, bmo, bd, 0, 0, 0, 0))
            : new Date(Date.UTC(by, bmo, bd, Number((b as any).startHour), Number((b as any).startMinute), 0, 0));
          const bEnd = bAllDay
            ? new Date(Date.UTC(by, bmo, bd, 23, 59, 59, 999))
            : new Date(Date.UTC(by, bmo, bd, Number((b as any).endHour), Number((b as any).endMinute), 0, 0));

          if (overlaps(bStart, bEnd, startsAt, endsAt)) {
            throw new Error("Wystąpiła kolizja z blokadą dostępności w tym terminie.");
          }
        }

        return data;
      },
    ],
  },

  fields: [
    {
      name: "type",
      label: "Typ rezerwacji",
      type: "select",
      required: true,
      options: [
        { label: "Stoliki", value: "stolik" },
        { label: "Kręgle", value: "kregle" },
        { label: "Bilard", value: "bilard" },
        { label: "Impreza (zapis na wydarzenie)", value: "impreza" },
        { label: "Biznes (zapis na wydarzenie)", value: "biznes" },
      ],
    },

    {
      name: "customer",
      label: "Dane klienta",
      type: "group",
      fields: [
        { name: "firstName", label: "Imię", type: "text", required: true },
        { name: "lastName", label: "Nazwisko", type: "text", required: true },
        { name: "phone", label: "Telefon", type: "text", required: true },
        { name: "email", label: "E-mail", type: "email", required: false },
      ],
    },

    { name: "notes", label: "Uwagi (klient)", type: "textarea" },
    {
      name: "internalNote",
      label: "Notatka wewnętrzna",
      type: "textarea",
      admin: {
        description: "Widoczna tylko dla obsługi. Wypełniana automatycznie przy problemach z płatnością.",
      },
    },

    {
      name: "day",
      label: "Dzień",
      type: "date",
      required: true,
    },
    { name: "allDay", label: "Całodniowe", type: "checkbox", defaultValue: false },

    {
      name: "startHour",
      label: "Start (godzina)",
      type: "select",
      required: true,
      options: hourOptions,
      defaultValue: "18",
      admin: { condition: (_, s) => !s?.allDay && s?.type !== "kregle" && s?.type !== "bilard" },
    },
    {
      name: "startMinute",
      label: "Start (minuta)",
      type: "select",
      required: true,
      options: minuteOptions,
      defaultValue: "0",
      admin: { condition: (_, s) => !s?.allDay && s?.type !== "kregle" && s?.type !== "bilard" },
    },

    {
      name: "endHour",
      label: "Koniec (godzina)",
      type: "select",
      required: false,
      options: hourOptions,
      admin: { condition: (_, s) => !s?.allDay && s?.type !== "kregle" && s?.type !== "bilard" },
    },
    {
      name: "endMinute",
      label: "Koniec (minuta)",
      type: "select",
      required: false,
      options: minuteOptions,
      admin: { condition: (_, s) => !s?.allDay && s?.type !== "kregle" && s?.type !== "bilard" },
      validate: (val, { siblingData }) => {
        if (siblingData?.allDay) return true;

        const endHour = siblingData?.endHour;
        const endMinute = val;

        const endHourEmpty = endHour == null || endHour === "";
        const endMinuteEmpty = endMinute == null || endMinute === "";

        if (endHourEmpty && endMinuteEmpty) return true;
        if (endHourEmpty !== endMinuteEmpty) return "Ustaw zarówno godzinę, jak i minutę końca.";

        return true;
      },
    },

    // ===== TECHNICZNE DATY (hidden) =====
    {
      name: "startsAt",
      label: "Start (timestamp)",
      type: "date",
      required: true,
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "endsAt",
      label: "Koniec (timestamp)",
      type: "date",
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "expiresAt",
      label: "Wygasa (timestamp)",
      type: "date",
      admin: { hidden: true },
    },

    // Stoliki
    {
      name: "partySize",
      label: "Liczba osób",
      type: "number",
      admin: { condition: (_, s) => ["stolik", "impreza", "biznes"].includes(s?.type) },
      validate: (val, { siblingData }) => {
        if (siblingData?.type !== "stolik") return true;
        const ps = clampPartySize(val as any);
        if (ps < 1) return "Podaj liczbę osób.";
        if (ps > 16) return "Maksymalnie 16 osób na jedną rezerwację online.";
        return true;
      },
    },
    {
      name: "tablesCount",
      label: "Liczba stolików",
      type: "number",
      admin: {
        hidden: true,
        readOnly: true,
      },
      validate: (val, { siblingData }) => {
        if (siblingData?.type !== "stolik") return true;
        if (typeof val !== "number" || val <= 0) return "Podaj liczbę stolików.";
        return true;
      },
    },

    // Kręgle/Bilard – picker zasobów (custom UI)
    {
      name: "resourcePicker",
      type: "ui",
      admin: {
        condition: (data) => data?.type === "kregle" || data?.type === "bilard",
        components: {
          Field: "@/components/admin/BowlingResourcePicker#BowlingResourcePicker",
        },
      },
    },

    // Kręgle/Bilard – zasoby (tory / stoły) — zarządzane przez picker powyżej
    {
      name: "resources",
      label: "Zasoby (tory / stoły)",
      type: "relationship",
      relationTo: "resources",
      hasMany: true,
      admin: {
        hidden: true,
      },
      filterOptions: ({ siblingData }) => {
        const t = siblingData?.type as ReservationType | undefined;
        const expected = t ? expectedResourceTypeByReservationType[t] : undefined;

        if (!expected) return { id: { exists: false } };

        return {
          type: { equals: expected },
          active: { equals: true },
        };
      },
      validate: (val, { siblingData }) => {
        const t = siblingData?.type as ReservationType | undefined;
        if (t !== "kregle" && t !== "bilard") return true;
        if (!Array.isArray(val) || val.length === 0) return "Wybierz co najmniej jeden zasób.";
        return true;
      },
    },

    // Segmenty per zasób (kregle/bilard) — auto-generowane, ukryte w panelu
    {
      name: "segments",
      label: "Tory / Stoły",
      type: "array",
      admin: {
        hidden: true,
      },
      fields: [
        {
          name: "resource",
          label: "Zasób",
          type: "relationship",
          relationTo: "resources",
          // Pomijamy walidację Payload (brak overrideAccess w route → błąd 500)
          validate: () => true,
        },
        {
          name: "startHour",
          label: "Start (godz.)",
          type: "number",
        },
        {
          name: "startMinute",
          label: "Start (min.)",
          type: "number",
          defaultValue: 0,
        },
        {
          name: "endHour",
          label: "Koniec (godz.)",
          type: "number",
        },
        {
          name: "endMinute",
          label: "Koniec (min.)",
          type: "number",
          defaultValue: 0,
        },
        {
          name: "price",
          label: "Cena (zł)",
          type: "number",
        },
      ],
    },

    // Biznes
    {
      name: "event",
      label: "Wydarzenie (biznes)",
      type: "relationship",
      relationTo: "events",
      admin: { condition: (_, s) => s?.type === "biznes" },
      validate: (val, { siblingData }) => {
        if (siblingData?.type !== "biznes") return true;
        if (!val) return "Wybierz wydarzenie.";
        return true;
      },
    },
    {
      name: "disabledPerson",
      label: "Osoba z niepełnosprawnością",
      type: "checkbox",
      defaultValue: false,
      admin: { condition: (_, s) => s?.type === "biznes" },
    },
    {
      name: "disabilityDetails",
      label: "Opis niepełnosprawności",
      type: "textarea",
      admin: { condition: (_, s) => s?.type === "biznes" && s?.disabledPerson },
    },

    // Faktura
    {
      name: "invoice",
      label: "Faktura",
      type: "group",
      admin: { condition: (data) => data?.type !== "stolik" },
      fields: [
        { name: "wantInvoice", label: "Chcę fakturę", type: "checkbox", defaultValue: false },
        {
          name: "invoiceType",
          label: "Typ faktury",
          type: "select",
          options: [
            { label: "Osoba prywatna", value: "personal" },
            { label: "Firma", value: "company" },
          ],
          admin: {
            condition: (_, siblingData) => Boolean(siblingData?.wantInvoice),
          },
        },
        {
          name: "nip",
          label: "NIP",
          type: "text",
          admin: {
            condition: (_, siblingData) =>
              Boolean(siblingData?.wantInvoice) && siblingData?.invoiceType === "company",
          },
          validate: (val, { siblingData }) => {
            if (!siblingData?.wantInvoice) return true;
            if (siblingData?.invoiceType !== "company") return true;
            if (!val || String(val).trim().length === 0) return "Podaj NIP.";
            const digits = String(val).replace(/\D/g, "");
            if (digits.length !== 10) return "NIP powinien mieć 10 cyfr.";
            return true;
          },
        },
      ],
    },

    { name: "acceptRules", label: "Akceptacja regulaminu", type: "checkbox", required: true, defaultValue: false },

    {
      name: "source",
      label: "Źródło",
      type: "select",
      required: true,
      defaultValue: "online",
      options: [
        { label: "Online", value: "online" },
        { label: "Telefon", value: "phone" },
        { label: "Obsługa", value: "staff" },
      ],
    },

    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      defaultValue: "new",
      options: [
        { label: "Nowe", value: "new" },
        { label: "Potwierdzone", value: "confirmed" },
        { label: "Anulowane", value: "cancelled" },
        { label: "Niepojawienie", value: "no_show" },
        { label: "Zakończone", value: "completed" },
      ],
    },

    // Płatności
    { name: "depositRequired", label: "Wymagana opłata", type: "checkbox", defaultValue: false, admin: { condition: (data) => data?.type !== "stolik" } },
    { name: "depositAmount", label: "Kwota (PLN)", type: "number", admin: { condition: (data) => data?.type !== "stolik" } },

    {
      name: "paymentStatus",
      label: "Status płatności",
      type: "select",
      required: true,
      defaultValue: "not_required",
      options: [
        { label: "Nie dotyczy", value: "not_required" },
        { label: "Oczekuje", value: "pending" },
        { label: "Weryfikacja", value: "verifying" },
        { label: "Opłacone", value: "paid" },
        { label: "Nieudane", value: "failed" },
        { label: "Wygasła", value: "expired" },
        { label: "Zwrot", value: "refunded" },
        { label: "Przepadło", value: "forfeited" },
      ],
      admin: { condition: (data) => data?.type !== "stolik" },
    },
    {
      name: "cancellationReason",
      label: "Powód anulowania",
      type: "select",
      required: false,
      options: [
        { label: "Płatność wygasła (niedokończona)", value: "payment_expired" },
        { label: "Płatność nieudana (błąd operatora)", value: "payment_failed" },
        { label: "Anulowane przez klienta", value: "cancelled_by_customer" },
        { label: "Anulowane przez obsługę", value: "cancelled_by_staff" },
        { label: "Anulowane przez system", value: "cancelled_by_system" },
      ],
      admin: {
        condition: (data) => data?.status === "cancelled",
        description:
          "Informacja techniczna/historyczna. Rekordy sprzed wdrożenia tego pola mają wartość pustą.",
      },
    },
    {
      name: "paymentProvider",
      label: "Operator płatności",
      type: "select",
      options: [{ label: "Przelewy24", value: "p24" }],
      admin: { condition: (data) => data?.type !== "stolik" },
    },
    { name: "payment", label: "Płatność", type: "relationship", relationTo: "payments", admin: { condition: (data) => data?.type !== "stolik" } },

    { name: "groupId", label: "Group ID (wew.)", type: "text", admin: { readOnly: true, hidden: true } },
    { name: "reservationNumber", label: "Numer rezerwacji", type: "text", admin: { readOnly: true } },
  ],
};
