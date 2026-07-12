import type { CollectionConfig } from 'payload'

const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const Resources: CollectionConfig = {
  slug: 'resources',
  labels: { singular: 'Zasób', plural: 'Zasoby' },
  admin: {
    group: 'Ustawienia',
    useAsTitle: 'label',
    components: {
      views: {
        list: {
          Component: '@/components/admin/ResourcesListView#ResourcesListView',
        },
      },
    },
  },
  access: {
    read: isStaffOrAdmin,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'type',
      label: 'Typ zasobu',
      type: 'select',
      required: true,
      options: [
        { label: 'Tor (kręgle)', value: 'lane' },
        { label: 'Stół (bilard)', value: 'billiard' },
      ],
    },
    { name: 'number', label: 'Numer', type: 'number', required: true },
    { name: 'label', label: 'Etykieta', type: 'text', required: true },
    { name: 'active', label: 'Aktywny', type: 'checkbox', defaultValue: true },
    { name: 'notes', label: 'Uwagi', type: 'textarea' },
  ],
  indexes: [{ fields: ['type', 'number'], unique: true }],
}
