import type { CollectionConfig } from 'payload'
const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const MenuCategories: CollectionConfig = {
  slug: 'menu-categories',
  labels: {
    singular: 'Kategoria menu',
    plural: 'Kategorie menu',
  },
  admin: {
    group: 'Restauracja',
    useAsTitle: 'name',
    components: {
      views: {
        list: {
          Component: '@/components/admin/MenuCategoriesListView#MenuCategoriesListView',
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
    { name: 'order', label: 'Kolejność', type: 'number', defaultValue: 0 },
    { name: 'active', label: 'Aktywna', type: 'checkbox', defaultValue: true },
  ],
}
