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
    useAsTitle: "title",
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
      async ({ data, req }) => {
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
