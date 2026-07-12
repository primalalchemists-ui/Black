import type { CollectionConfig } from 'payload'

const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

const mapPaymentToReservationStatus = (s: PaymentStatus) => {
  switch (s) {
    case 'paid':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'refunded':
      return 'refunded'
    default:
      return 'pending'
  }
}

export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: 'Płatność', plural: 'Płatności' },
  admin: {
    group: 'Obsługa',
    defaultColumns: ['provider', 'status', 'amount', 'createdAt'],
    components: {
      views: {
        list: {
          Component: '@/components/admin/PaymentsListView#PaymentsListView',
        },
      },
    },
  },
  access: {
    read: isStaffOrAdmin,
    create: () => true,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === 'admin',
  },

  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        if (!doc?.reservation) return

        const reservationId =
          typeof doc.reservation === 'string' ? doc.reservation : (doc.reservation as any).id

        // Sync payment id + status to reservation
        await req.payload.update({
          collection: 'reservations',
          id: reservationId,
          data: {
            payment: doc.id,
            paymentProvider: doc.provider,
            paymentStatus: mapPaymentToReservationStatus(doc.status as PaymentStatus),
          },
          overrideAccess: true,
        })
      },
    ],
  },

  fields: [
    {
      name: 'provider',
      label: 'Operator',
      type: 'select',
      required: true,
      options: [{ label: 'Przelewy24', value: 'p24' }],
      defaultValue: 'p24',
    },
    {
      name: 'status',
      label: 'Status płatności',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: [
        { label: 'Oczekuje', value: 'pending' },
        { label: 'Opłacona', value: 'paid' },
        { label: 'Nieudana', value: 'failed' },
        { label: 'Zwrócona', value: 'refunded' },
      ],
    },
    { name: 'amount', label: 'Kwota (PLN)', type: 'number', required: true },
    { name: 'currency', label: 'Waluta', type: 'text', defaultValue: 'PLN' },

    { name: 'p24SessionId', label: 'P24 Session ID', type: 'text' },
    { name: 'p24OrderId', label: 'P24 Order ID', type: 'text' },
    { name: 'p24Sign', label: 'P24 Sign', type: 'text' },

    { name: 'reservation', label: 'Powiązana rezerwacja', type: 'relationship', relationTo: 'reservations' },
    { name: 'raw', label: 'Surowe dane (debug)', type: 'json' },
  ],
}
