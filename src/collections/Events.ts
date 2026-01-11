import type { CollectionConfig } from 'payload'

const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

const hourOptions = Array.from({ length: 24 }, (_, h) => ({
  label: `${String(h).padStart(2, '0')}:00`,
  value: String(h),
}))

// wybierz krok minutowy jaki chcesz: 0/15/30/45
const minuteOptions = [
  { label: '00', value: '0' },
  { label: '15', value: '15' },
  { label: '30', value: '30' },
  { label: '45', value: '45' },
]

function buildDateTimeFromDayHourMinute(
  day: string | Date,
  hourStr: string,
  minuteStr: string,
) {
  const d = new Date(day)
  d.setHours(Number(hourStr), Number(minuteStr), 0, 0)
  return d.toISOString()
}

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Wydarzenie', plural: 'Wydarzenia' },
  admin: {
    group: 'Treści strony',
    useAsTitle: 'title',
    defaultColumns: ['title', 'startsAt', 'kind', 'status'],
  },
  access: {
    read: () => true,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === 'admin',
  },

  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        if (data.day) {
          const day = data.day as any

          if (data.allDay) {
            const start = new Date(day)
            start.setHours(0, 0, 0, 0)

            const end = new Date(day)
            end.setHours(23, 59, 59, 999)

            data.startsAt = start.toISOString()
            data.endsAt = end.toISOString()
          } else {
            const startHour = String(data.startHour ?? '0')
            const startMinute = String(data.startMinute ?? '0')

            const endHour = data.endHour != null ? String(data.endHour) : ''
            const endMinute = data.endMinute != null ? String(data.endMinute) : ''

            data.startsAt = buildDateTimeFromDayHourMinute(day, startHour, startMinute)

            // endsAt opcjonalne — liczymy tylko jeśli oba pola końca są podane
            if (endHour !== '' && endMinute !== '') {
              const endsAtIso = buildDateTimeFromDayHourMinute(day, endHour, endMinute)

              const start = new Date(data.startsAt)
              const end = new Date(endsAtIso)

              if (end <= start) {
                throw new Error('Czas „Koniec” musi być późniejszy niż „Start”.')
              }

              data.endsAt = endsAtIso
            } else {
              data.endsAt = undefined
            }
          }
        }

        return data
      },
    ],
  },

  fields: [
    { name: 'title', label: 'Tytuł', type: 'text', required: true },
    { name: 'description', label: 'Opis', type: 'textarea' },

    {
      name: 'kind',
      label: 'Typ',
      type: 'select',
      required: true,
      options: [
        { label: 'Promocja', value: 'promo' },
        { label: 'Biznes', value: 'business' },
        { label: 'Impreza', value: 'party' },
        { label: 'Sport', value: 'sport' },
      ],
      defaultValue: 'promo',
    },

    {
      name: "pricePLN",
      label: "Cena (PLN)",
      type: "number",
      min: 0,
      admin: {
        description: "Opcjonalne. Ustaw np. dla wydarzeń biznesowych lub biletowanych. 0 = darmowe.",
      },
    },

    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      options: [
        { label: 'Planowane', value: 'planned' },
        { label: 'Odwołane', value: 'cancelled' },
      ],
      defaultValue: 'planned',
    },

    // === UI: dzień + czas ===
    {
      name: 'day',
      label: 'Dzień',
      type: 'date',
      required: true,
      admin: { description: 'Wybierz dzień wydarzenia. Godzinę i minutę ustawisz poniżej.' },
    },
    { name: 'allDay', label: 'Całodniowe', type: 'checkbox', defaultValue: false },

    {
      name: 'startHour',
      label: 'Start (godzina)',
      type: 'select',
      required: true,
      options: hourOptions,
      defaultValue: '18',
      admin: { condition: (_, s) => !s?.allDay },
    },
    {
      name: 'startMinute',
      label: 'Start (minuta)',
      type: 'select',
      required: true,
      options: minuteOptions,
      defaultValue: '0',
      admin: { condition: (_, s) => !s?.allDay },
    },

    {
      name: 'endHour',
      label: 'Koniec (godzina)',
      type: 'select',
      required: false,
      options: hourOptions,
      admin: { condition: (_, s) => !s?.allDay },
    },
    {
      name: 'endMinute',
      label: 'Koniec (minuta)',
      type: 'select',
      required: false,
      options: minuteOptions,
      admin: { condition: (_, s) => !s?.allDay },
      validate: (val, { siblingData }) => {
        if (siblingData?.allDay) return true

        const endHour = siblingData?.endHour
        const endMinute = val

        // koniec opcjonalny: oba muszą być ustawione albo oba puste
        const endHourEmpty = endHour == null || endHour === ''
        const endMinuteEmpty = endMinute == null || endMinute === ''

        if (endHourEmpty && endMinuteEmpty) return true
        if (endHourEmpty !== endMinuteEmpty) return 'Ustaw zarówno godzinę, jak i minutę końca.'

        // jeśli oba są, porównujemy start vs end
        const day = siblingData?.day
        if (!day) return true

        const startIso = buildDateTimeFromDayHourMinute(
          day,
          String(siblingData?.startHour ?? '0'),
          String(siblingData?.startMinute ?? '0'),
        )
        const endIso = buildDateTimeFromDayHourMinute(day, String(endHour), String(endMinute))

        if (new Date(endIso) <= new Date(startIso)) return 'Czas „Koniec” musi być późniejszy niż „Start”.'
        return true
      },
    },

    // === TECHNICZNE DATY (hidden) ===
    {
      name: 'startsAt',
      label: 'Start (timestamp)',
      type: 'date',
      required: true,
      admin: { readOnly: true, hidden: true },
    },
    {
      name: 'endsAt',
      label: 'Koniec (timestamp)',
      type: 'date',
      admin: { readOnly: true, hidden: true },
    },

    { name: 'image', label: 'Zdjęcie', type: 'upload', relationTo: 'media' },

    { name: 'capacity', label: 'Limit miejsc', type: 'number' },
    {
      name: 'registrationsEnabled',
      label: 'Zapisy aktywne',
      type: 'checkbox',
      defaultValue: true,
    },

    { name: 'published', label: 'Opublikowane', type: 'checkbox', defaultValue: true },
  ],
}
