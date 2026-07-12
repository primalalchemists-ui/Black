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

const IGNORED_STATUSES = ["cancelled", "no_show"] as const;

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
        // Dla rezerwacji przez panel (req.user istnieje) sprawdzamy czy BowlingResourcePicker
        // już ustawił segmenty z per-zasób godzinami. Jeśli tak — zostawiamy je i obliczamy
        // startsAt/endsAt z min/max segmentów. Jeśli nie — generujemy z top-level pól (fallback).
        // Dla rezerwacji online (brak req.user) segments przychodzą gotowe z route.
        if (req?.user && (type === "kregle" || type === "bilard")) {
          const existingSegments = Array.isArray((data as any).segments)
            ? ((data as any).segments as any[])
            : [];
          const hasPerResourceSegments =
            existingSegments.length > 0 && existingSegments[0]?.resource != null;

          if (hasPerResourceSegments) {
            // Segmenty ustawione przez BowlingResourcePicker — oblicz startsAt/endsAt z min/max
            if ((data as any).day) {
              const day = (data as any).day;
              const startTotals = existingSegments.map(
                (s: any) => Number(s.startHour ?? 0) * 60 + Number(s.startMinute ?? 0),
              );
              const endTotals = existingSegments.map(
                (s: any) => Number(s.endHour ?? 0) * 60 + Number(s.endMinute ?? 0),
              );
              const minStart = Math.min(...startTotals);
              const maxEnd = Math.max(...endTotals);
              (data as any).startsAt = buildDateTimeFromDayHourMinuteUTC(
                day,
                String(Math.floor(minStart / 60)),
                String(minStart % 60),
              );
              (data as any).endsAt = buildDateTimeFromDayHourMinuteUTC(
                day,
                String(Math.floor(maxEnd / 60)),
                String(maxEnd % 60),
              );
            }
            // Segmenty zostawiamy bez zmian
          } else {
            // Brak segmentów od komponentu — generuj z top-level pól (stare zachowanie)
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
        }

        return data;
      },
    ],

    // ✅ BLOKADA KOLIZJI + BLOKADA PRZESZŁOŚCI (działa też w panelu)
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        const incoming: any = data || {};
        const type = String(incoming.type ?? originalDoc?.type ?? "");
        const status = String(incoming.status ?? originalDoc?.status ?? "");
        const source = String(incoming.source ?? originalDoc?.source ?? "online");

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

        // 3) BLOKADA PRZESZŁOŚCI:
        // - online: zawsze blok
        // - staff/admin: blok, chyba że status=completed (np. dopisanie historycznej)
        const isStaff = ["admin", "staff"].includes(req.user?.role);
        const now = new Date();

        const allowPastBecauseCompleted = isStaff && status === "completed";
        const mustBlockPast =
          !allowPastBecauseCompleted && startsAt.getTime() < now.getTime();

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
            ],
          },
        });

        for (const r of (candidates.docs || []) as any[]) {
          // jeśli kandydat też jest cancelled/no_show to pomiń (na wypadek)
          const rStatus = String(r.status ?? "");
          if (IGNORED_STATUSES.includes(rStatus as any)) continue;

          // (opcjonalnie) jeśli chcesz, aby completed NIE blokowało dostępności, odkomentuj:
          // if (rStatus === "completed") continue;

          const otherResources = relIds(r.resources);
          const touchesSame = otherResources.some((id) => resources.includes(id));
          if (!touchesSame) continue;

          const rStart = new Date(r.startsAt);
          const rEnd = new Date(r.endsAt);
          if (isNaN(rStart.getTime()) || isNaN(rEnd.getTime())) continue;

          if (overlaps(rStart, rEnd, startsAt, endsAt)) {
            throw new Error("Kolizja: wybrany tor/stół jest już zarezerwowany w tym czasie.");
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

    { name: "notes", label: "Uwagi", type: "textarea" },

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
        { label: "Opłacone", value: "paid" },
        { label: "Nieudane", value: "failed" },
        { label: "Zwrot", value: "refunded" },
        { label: "Przepadło", value: "forfeited" },
      ],
      admin: { condition: (data) => data?.type !== "stolik" },
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
