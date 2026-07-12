import type { CollectionConfig } from 'payload'

const isAdmin = ({ req }: any) => req.user?.role === 'admin'

const hourOptions = Array.from({ length: 24 }, (_, h) => ({
  label: `${String(h).padStart(2, '0')}:00`,
  value: String(h),
}))

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
    group: 'Wydarzenia',
    useAsTitle: 'title',
    disableDuplicate: true,
    defaultColumns: ['title', 'startsAt', 'kind', 'status'],
    components: {
      views: {
        list: {
          Component: '@/components/admin/EventsListView#EventsListView',
        },
      },
    },
  },
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },

  hooks: {
    afterRead: [
      async ({ doc, req, findMany, context }) => {
        if (findMany) return doc
        if ((context as any)?.skipTakenSeats) return doc
        if (!req?.payload) return doc
        try {
          const result = await req.payload.find({
            collection: 'reservations',
            limit: 5000,
            pagination: false,
            overrideAccess: true,
            depth: 0,
            where: {
              and: [
                { event: { equals: doc.id } },
                { status: { in: ['new', 'confirmed'] } },
              ],
            },
          })
          const takenSeats = (result.docs as any[]).reduce(
            (sum: number, r: any) => sum + (Number(r.partySize) || 0),
            0,
          )
          return { ...doc, takenSeats }
        } catch {
          return doc
        }
      },
    ],
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        if (data.day) {
          const day = data.day as any

          const startHour = String(data.startHour ?? '0')
          const startMinute = String(data.startMinute ?? '0')

          const endHour = data.endHour != null ? String(data.endHour) : ''
          const endMinute = data.endMinute != null ? String(data.endMinute) : ''

          data.startsAt = buildDateTimeFromDayHourMinute(day, startHour, startMinute)

          if (endHour !== '' && endMinute !== '') {
            const start = new Date(data.startsAt)
            let end = new Date(buildDateTimeFromDayHourMinute(day, endHour, endMinute))

            // Handle overnight events — if end is not after start, push to next day
            if (end <= start) {
              end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
            }

            data.endsAt = end.toISOString()
          } else {
            data.endsAt = undefined
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
      label: 'Typ wydarzenia',
      type: 'select',
      options: [
        { label: 'Impreza', value: 'impreza' },
        { label: 'Biznes', value: 'biznes' },
      ],
    },

    {
      name: 'pricePLN',
      label: 'Cena (PLN)',
      type: 'number',
      min: 0,
      admin: {
        description: 'Dla darmowych wydarzeń ustaw 0.',
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

    {
      name: 'day',
      label: 'Dzień',
      type: 'date',
      required: true,
    },
    {
      name: 'startHour',
      label: 'Start (godzina)',
      type: 'select',
      required: true,
      options: hourOptions,
      defaultValue: '18',
    },
    {
      name: 'startMinute',
      label: 'Start (minuta)',
      type: 'select',
      required: true,
      options: minuteOptions,
      defaultValue: '0',
    },

    {
      name: 'endHour',
      label: 'Koniec (godzina)',
      type: 'select',
      required: false,
      options: hourOptions,
    },
    {
      name: 'endMinute',
      label: 'Koniec (minuta)',
      type: 'select',
      required: false,
      options: minuteOptions,
      validate: (val, { siblingData }) => {
        const endHour = siblingData?.endHour
        const endMinute = val

        const endHourEmpty = endHour == null || endHour === ''
        const endMinuteEmpty = endMinute == null || endMinute === ''

        if (endHourEmpty && endMinuteEmpty) return true
        if (endHourEmpty !== endMinuteEmpty) return 'Ustaw zarówno godzinę, jak i minutę końca.'

        return true
      },
    },

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

    {
      name: 'showOnHomepage',
      label: 'Pokaż na stronie głównej',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'blocksVenue',
      label: 'Blokuje lokal',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'blockAllDay',
      label: 'Blokada całodniowa',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        condition: (_, siblingData) => Boolean(siblingData?.blocksVenue),
      },
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

    {
      name: 'takenSeats',
      label: 'Zapisanych osób',
      type: 'number',
      virtual: true,
      admin: {
        readOnly: true,
        position: 'sidebar',
      },
    },
  ],
}
