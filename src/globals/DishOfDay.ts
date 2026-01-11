import type { GlobalConfig } from 'payload'
const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const DishOfDay: GlobalConfig = {
  slug: 'dish-of-day',
  label: 'Danie dnia',
  access: { read: () => true, update: isStaffOrAdmin },
  fields: [
    { name: 'item', label: 'Pozycja z menu', type: 'relationship', relationTo: 'menu-items' },
    { name: 'customTitle', label: 'Tytuł własny', type: 'text' },
    { name: 'customDescription', label: 'Opis własny', type: 'textarea' },
    { name: 'validUntil', label: 'Ważne do', type: 'date' },
  ],
}
