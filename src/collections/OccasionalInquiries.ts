import type { CollectionConfig } from "payload"

const isStaffOrAdmin = ({ req }: any) => ["admin", "staff"].includes(req.user?.role)

const hourOptions = Array.from({ length: 24 }, (_, h) => ({
  label: `${String(h).padStart(2, "0")}:00`,
  value: String(h),
}))

const minuteOptions = [
  { label: "00", value: "0" },
  { label: "15", value: "15" },
  { label: "30", value: "30" },
  { label: "45", value: "45" },
]

function buildDateTimeFromDayHourMinute(day: string | Date, hourStr: string, minuteStr: string) {
  const d = new Date(day)
  d.setHours(Number(hourStr), Number(minuteStr), 0, 0)
  return d.toISOString()
}

export const OccasionalInquiries: CollectionConfig = {
  slug: "occasional-inquiries",
  labels: {
    singular: "Zapytanie okolicznościowe",
    plural: "Zapytania okolicznościowe",
  },
  admin: {
    group: "Imprezy okolicznościowe",
    useAsTitle: "name",
    defaultColumns: ["type", "date", "startsAt", "status"],
  },
  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === "admin",
  },

  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        // ===== USTAWIANIE startsAt/endsAt z UI pól (date + time) =====
        const day = (data as any).date
        if (!day) return data

        const allDay = Boolean((data as any).allDay)

        if (allDay) {
          const start = new Date(day)
          start.setHours(0, 0, 0, 0)

          const end = new Date(day)
          end.setHours(23, 59, 59, 999)

          ;(data as any).startsAt = start.toISOString()
          ;(data as any).endsAt = end.toISOString()

          // czyścimy UI time pola, żeby nie było śmieci w DB
          ;(data as any).startHour = undefined
          ;(data as any).startMinute = undefined
          ;(data as any).endHour = undefined
          ;(data as any).endMinute = undefined

          return data
        }

        const startHour = String((data as any).startHour ?? "0")
        const startMinute = String((data as any).startMinute ?? "0")

        const endHour = (data as any).endHour != null ? String((data as any).endHour) : ""
        const endMinute = (data as any).endMinute != null ? String((data as any).endMinute) : ""

        const startIso = buildDateTimeFromDayHourMinute(day, startHour, startMinute)
        ;(data as any).startsAt = startIso

        // endsAt opcjonalne: liczymy tylko jeśli oba końcowe pola są podane
        if (endHour !== "" && endMinute !== "") {
          const endIso = buildDateTimeFromDayHourMinute(day, endHour, endMinute)
          const startD = new Date(startIso)
          const endD = new Date(endIso)

          if (endD <= startD) {
            throw new Error("Czas „Koniec” musi być późniejszy niż „Start”.")
          }

          ;(data as any).endsAt = endIso
        } else {
          ;(data as any).endsAt = undefined
        }

        return data
      },
    ],
  },

  fields: [
    {
      name: "type",
      label: "Rodzaj imprezy",
      type: "select",
      required: true,
      options: [
        { label: "Komunia", value: "komunia" },
        { label: "Stypa", value: "stypa" },
        { label: "Urodziny", value: "urodziny" },
        { label: "Inne", value: "inne" },
      ],
    },

    // ===== DATA + GODZINY (NOWE) =====
    {
      name: "date",
      label: "Data",
      type: "date",
      required: true,
      admin: { description: "Wybierz dzień imprezy. Godziny ustawisz poniżej." },
    },
    { name: "allDay", label: "Całodniowe", type: "checkbox", defaultValue: false },

    {
      name: "startHour",
      label: "Start (godzina)",
      type: "select",
      required: true,
      options: hourOptions,
      defaultValue: "18",
      admin: { condition: (_, s) => !s?.allDay },
    },
    {
      name: "startMinute",
      label: "Start (minuta)",
      type: "select",
      required: true,
      options: minuteOptions,
      defaultValue: "0",
      admin: { condition: (_, s) => !s?.allDay },
    },

    {
      name: "endHour",
      label: "Koniec (godzina)",
      type: "select",
      required: false,
      options: hourOptions,
      admin: { condition: (_, s) => !s?.allDay },
    },
    {
      name: "endMinute",
      label: "Koniec (minuta)",
      type: "select",
      required: false,
      options: minuteOptions,
      admin: { condition: (_, s) => !s?.allDay },
      validate: (val, { siblingData }) => {
        if (siblingData?.allDay) return true

        const endHour = siblingData?.endHour
        const endMinute = val

        // koniec opcjonalny: oba muszą być ustawione albo oba puste
        const endHourEmpty = endHour == null || endHour === ""
        const endMinuteEmpty = endMinute == null || endMinute === ""

        if (endHourEmpty && endMinuteEmpty) return true
        if (endHourEmpty !== endMinuteEmpty) return "Ustaw zarówno godzinę, jak i minutę końca."

        const day = siblingData?.date
        if (!day) return true

        const startIso = buildDateTimeFromDayHourMinute(
          day,
          String(siblingData?.startHour ?? "0"),
          String(siblingData?.startMinute ?? "0"),
        )
        const endIso = buildDateTimeFromDayHourMinute(day, String(endHour), String(endMinute))

        if (new Date(endIso) <= new Date(startIso)) return "Czas „Koniec” musi być późniejszy niż „Start”."
        return true
      },
    },

    // ===== TECHNICZNE DATY (hidden) =====
    {
      name: "startsAt",
      label: "Start (timestamp)",
      type: "date",
      admin: { readOnly: true, hidden: true },
    },
    {
      name: "endsAt",
      label: "Koniec (timestamp)",
      type: "date",
      admin: { readOnly: true, hidden: true },
    },

    // ===== RESZTA PÓL (jak było) =====
    { name: "people", label: "Liczba osób", type: "number" },
    { name: "name", label: "Imię i nazwisko", type: "text", required: true },
    { name: "phone", label: "Telefon", type: "text", required: true },
    { name: "email", label: "E-mail", type: "email" },
    { name: "notes", label: "Uwagi", type: "textarea" },

    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      options: [
        { label: "Nowe", value: "new" },
        { label: "W trakcie", value: "in_progress" },
        { label: "Potwierdzone", value: "confirmed" },
        { label: "Odrzucone", value: "rejected" },
      ],
      defaultValue: "new",
    },

    {
      name: "payment",
      label: "Płatność",
      type: "group",
      fields: [
        { name: "paid", label: "Opłacone", type: "checkbox", defaultValue: false },
        { name: "depositAmount", label: "Zaliczka (PLN)", type: "number" },
        { name: "totalAmount", label: "Kwota całkowita (PLN)", type: "number" },
      ],
    },
  ],
}
