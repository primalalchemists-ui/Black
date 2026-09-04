import type { CollectionConfig } from 'payload'

const isAdmin = ({ req }: any) => req.user?.role === 'admin'
const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded'

const mapPaymentToReservationStatus = (s: PaymentStatus) => {
  switch (s) {
    case 'paid':
      return 'paid'
    case 'pending':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'expired':
      return 'expired'
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
    disableDuplicate: true,
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
    update: isAdmin,
    delete: isAdmin,
  },

  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        if (!doc?.reservation) return

        // context.skipPaymentSync: wywołujący sam ustawił już poprawny
        // reservation.paymentStatus i ta synchronizacja tylko by go nadpisała.
        // Używane przez wygaszanie nieopłaconych rezerwacji
        // (src/lib/reservationExpiry.ts) — bez tego guardu hook cofnąłby
        // świeżo ustawione 'expired'.
        if ((req.context as any)?.skipPaymentSync) return

        const reservationId =
          typeof doc.reservation === 'string' ? doc.reservation : (doc.reservation as any).id

        // Sync payment status to reservation.
        // Do NOT set `payment: doc.id` here — the payment row may not be committed
        // yet when this hook runs on a separate connection, causing an FK violation
        // (reservations_payment_id_payments_id_fk). The payment→reservation link is
        // already stored on the payment doc itself (payments.reservation field).
        // context.skipConflictCheck: true — Reservations.beforeChange skips the
        // expensive req.payload.find (conflict check) for kregle/bilard types.
        // Catch 404: when a reservation is deleted, Payload nulls out payments.reservation
        // which triggers this hook — but the reservation is already gone, so ignore it.
        // Fire-and-forget: never block the caller (delete, create, etc.) on this sync.
        // If the reservation is mid-delete, being deleted, or the update deadlocks — just log and move on.
        req.payload.update({
          collection: 'reservations',
          id: reservationId,
          data: {
            paymentProvider: doc.provider,
            paymentStatus: mapPaymentToReservationStatus(doc.status as PaymentStatus),
          },
          overrideAccess: true,
          context: { skipConflictCheck: true } as any,
        }).catch((err: any) => {
          console.error('[Payments.afterChange] reservation sync skipped:', err?.message ?? err)
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
        { label: 'Wygasła', value: 'expired' },
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
