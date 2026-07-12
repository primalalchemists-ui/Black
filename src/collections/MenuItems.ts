import type { CollectionConfig } from 'payload'
const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const MenuItems: CollectionConfig = {
  slug: 'menu-items',
  labels: {
    singular: 'Pozycja menu',
    plural: 'Pozycje menu',
  },
  admin: {
    group: 'Restauracja',
    useAsTitle: 'name',
    disableDuplicate: true,
    defaultColumns: ['name', 'category', 'price', 'active'],
    components: {
      views: {
        list: {
          Component: '@/components/admin/MenuItemsListView#MenuItemsListView',
        },
      },
    },
  },
  access: {
    read: () => true,
    create: isStaffOrAdmin,
    update: isStaffOrAdmin,
    delete: ({ req }: any) => req.user?.role === 'admin',
  },
  fields: [
    { name: 'name', label: 'Nazwa', type: 'text', required: true },
    { name: 'description', label: 'Opis', type: 'textarea' },
    { name: 'image', label: 'Zdjęcie', type: 'upload', relationTo: 'media', admin: { hidden: true } },
    {
      name: 'category',
      label: 'Kategoria',
      type: 'relationship',
      relationTo: 'menu-categories',
      required: true,
    },
    { name: 'price', label: 'Cena standardowa (PLN)', type: 'number', required: true },

    {
      name: 'promo',
      label: 'Promocja',
      type: 'group',
      fields: [
        { name: 'enabled', label: 'Aktywna', type: 'checkbox', defaultValue: false },
        { name: 'promoPrice', label: 'Cena promocyjna (PLN)', type: 'number' },
        { name: 'startsAt', label: 'Start promocji', type: 'date' },
        { name: 'endsAt', label: 'Koniec promocji', type: 'date' },
      ],
    },

    { name: 'order', label: 'Kolejność', type: 'number', defaultValue: 0 },
    { name: 'active', label: 'Aktywna', type: 'checkbox', defaultValue: true },
  ],
}
