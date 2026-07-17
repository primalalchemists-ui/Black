// src/collections/Blackouts.ts
import type { CollectionConfig } from "payload";
import type { Service } from "@/lib/resourceFilters";
import { expectedResourceTypeByService, extractRelationshipIds } from "@/lib/resourceFilters";

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

export const Blackouts: CollectionConfig = {
  slug: "blackouts",
  labels: { singular: "Blokada dostępności", plural: "Blokady dostępności" },

  admin: {
    group: "Obsługa",
    useAsTitle: "title",
    disableDuplicate: true,
    defaultColumns: ["service", "day", "allDay", "startHour", "startMinute", "endHour", "endMinute", "active"],
    components: {
      views: {
        list: {
          Component: '@/components/admin/BlackoutsListView#BlackoutsListView',
        },
      },
    },
  },

  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === "admin",
  },

  hooks: {
    beforeChange: [
      async ({ data, req, operation, originalDoc }) => {
        if (!data) return data;

        const service = (data as any).service as Service | undefined;
        if (!service) return data;

        // ===== zasoby =====
        const ids = extractRelationshipIds((data as any).resources);
        if (ids.length === 0) {
          throw new Error("Wybierz co najmniej jeden zasób do zablokowania.");
        }

        const expectedType = expectedResourceTypeByService[service];

        const found = await req.payload.find({
          collection: "resources",
          where: { id: { in: ids } },
          limit: 200,
          overrideAccess: true,
        });

        const wrong = (found?.docs || []).filter((r: any) => r?.type !== expectedType);
        if (wrong.length > 0) {
          const wrongLabels = wrong.map((r: any) => r?.label || r?.id).join(", ");
          throw new Error(
            service === "bowling"
              ? `Dla kręgli możesz blokować tylko tory (lane). Błędne zasoby: ${wrongLabels}`
              : `Dla bilarda możesz blokować tylko stoły bilardowe (billiard). Błędne zasoby: ${wrongLabels}`,
          );
        }

        // ===== walidacja czasu =====
        const allDay = Boolean((data as any).allDay);

        if (!allDay) {
          const startH = Number((data as any).startHour);
          const startM = Number((data as any).startMinute);
          const endH = Number((data as any).endHour);
          const endM = Number((data as any).endMinute);

          if ([startH, startM, endH, endM].some((x) => Number.isNaN(x))) {
            throw new Error("Nieprawidłowa godzina/minuta.");
          }

          if (startH < 0 || startH > 23 || endH < 0 || endH > 23) {
            throw new Error("Godzina musi być w zakresie 0–23.");
          }
          if (startM < 0 || startM > 59 || endM < 0 || endM > 59) {
            throw new Error("Minuta musi być w zakresie 0–59.");
          }

          const startTotal = startH * 60 + startM;
          const endTotal = endH * 60 + endM;

          if (endTotal <= startTotal) {
            throw new Error("Czas „Do” musi być późniejszy niż „Od”.");
          }
        } else {
          // porządek danych przy całodniowej (bezpieczne wartości z listy)
          (data as any).startHour = "0";
          (data as any).startMinute = "0";
          (data as any).endHour = "23";
          (data as any).endMinute = "0";
        }

        // ===== SPRAWDZENIE KOLIZJI =====
        const day = (data as any).day;
        if (!day) return data;

        const base = new Date(day);
        const y = base.getUTCFullYear(), mo = base.getUTCMonth(), d = base.getUTCDate();

        function toUTC(hour: number, minute: number): Date {
          return new Date(Date.UTC(y, mo, d, hour, minute, 0, 0));
        }

        const bStart = allDay ? toUTC(0, 0) : toUTC(Number((data as any).startHour), Number((data as any).startMinute));
        const bEnd   = allDay ? toUTC(23, 59) : toUTC(Number((data as any).endHour), Number((data as any).endMinute));

        function resOverlap(a: Date, b: Date, c: Date, dd: Date) {
          return a.getTime() < dd.getTime() && c.getTime() < b.getTime();
        }

        function extractIds(val: any): string[] {
          if (!Array.isArray(val)) return [];
          return (val as any[]).map((x: any) => {
            if (!x) return null;
            if (typeof x === "string" || typeof x === "number") return String(x);
            if (x?.id != null) return String(x.id);
            if (x?.value?.id != null) return String(x.value.id);
            if (typeof x?.value === "string") return x.value;
            return null;
          }).filter(Boolean) as string[];
        }

        const now = new Date();
        const reservationType = service === "bowling" ? "kregle" : "bilard";

        // 1) Kolizja z istniejącymi rezerwacjami
        const resCandidates = await req.payload.find({
          collection: "reservations",
          limit: 200,
          overrideAccess: true,
          where: {
            and: [
              { type: { equals: reservationType } },
              { status: { not_in: ["cancelled", "no_show", "completed"] as any } },
              { startsAt: { less_than: bEnd.toISOString() } },
              { endsAt: { greater_than: bStart.toISOString() } },
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

        for (const r of resCandidates.docs as any[]) {
          const rIds = extractIds(r.resources);
          if (ids.some((id) => rIds.includes(id))) {
            throw new Error("Wystąpiła kolizja z istniejącą rezerwacją w tym terminie.");
          }
        }

        // 2) Kolizja z innymi blokadami
        const selfId = operation === "update" ? String(originalDoc?.id ?? "") : null;
        const dayStart = toUTC(0, 0).toISOString();
        const dayEnd   = toUTC(23, 59).toISOString();

        const bCandidates = await req.payload.find({
          collection: "blackouts",
          limit: 200,
          overrideAccess: true,
          where: {
            and: [
              { service: { equals: service } },
              { active: { equals: true } },
              { day: { greater_than_equal: dayStart } },
              { day: { less_than_equal: dayEnd } },
              ...(selfId ? [{ id: { not_equals: selfId } }] : []),
            ],
          },
        });

        for (const b of bCandidates.docs as any[]) {
          const bOtherIds = extractIds((b as any).resources);
          if (!ids.some((id) => bOtherIds.includes(id))) continue;

          const bOtherAllDay = Boolean((b as any).allDay);
          const bOtherStart = bOtherAllDay ? toUTC(0, 0) : toUTC(Number((b as any).startHour), Number((b as any).startMinute));
          const bOtherEnd   = bOtherAllDay ? toUTC(23, 59) : toUTC(Number((b as any).endHour), Number((b as any).endMinute));

          if (resOverlap(bStart, bEnd, bOtherStart, bOtherEnd)) {
            throw new Error("Wystąpiła kolizja z istniejącą blokadą dostępności w tym terminie.");
          }
        }

        return data;
      },
    ],
  },

  fields: [
    { name: "title", label: "Nazwa blokady", type: "text", required: true },

    {
      name: "service",
      label: "Usługa",
      type: "select",
      required: true,
      options: [
        { label: "Kręgle", value: "bowling" },
        { label: "Bilard", value: "billiard" },
      ],
    },

    {
      name: "day",
      label: "Dzień",
      type: "date",
      required: true,
    },

    { name: "allDay", label: "Całodniowa", type: "checkbox", defaultValue: false },

    {
      name: "startHour",
      label: "Od (godzina)",
      type: "select",
      required: false,
      options: hourOptions,
      defaultValue: "0",
      admin: { condition: (_, s) => !s?.allDay },
    },
    {
      name: "startMinute",
      label: "Od (minuta)",
      type: "select",
      required: false,
      options: minuteOptions,
      defaultValue: "0",
      admin: { condition: (_, s) => !s?.allDay },
    },

    {
      name: "endHour",
      label: "Do (godzina)",
      type: "select",
      required: false,
      options: hourOptions,
      defaultValue: "23",
      admin: { condition: (_, s) => !s?.allDay },
    },
    {
      name: "endMinute",
      label: "Do (minuta)",
      type: "select",
      required: false,
      options: minuteOptions,
      defaultValue: "0",
      admin: { condition: (_, s) => !s?.allDay },
    },

    {
      name: "resources",
      label: "Zasoby (tory / stoły)",
      type: "relationship",
      relationTo: "resources",
      hasMany: true,
      required: true,
      admin: {
        condition: (_, s) => Boolean(s?.service),
      },

      // ✅ filtr w adminie: tylko właściwy typ dla usługi
      filterOptions: ({ siblingData }) => {
        const service = siblingData?.service as Service | undefined;
        if (!service) return { id: { exists: false } };

        const expectedType = expectedResourceTypeByService[service];
        return {
          type: { equals: expectedType },
          active: { equals: true },
        };
      },
    },

    { name: "reason", label: "Powód / notatka", type: "textarea" },
    { name: "active", label: "Aktywna", type: "checkbox", defaultValue: true },
  ],
};
