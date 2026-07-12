import type { CollectionConfig } from 'payload'

const isAdmin = ({ req }: any) => req.user?.role === 'admin'
const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Użytkownik',
    plural: 'Użytkownicy',
  },
  auth: true,
  admin: {
    group: 'Administracja',
    useAsTitle: 'email',
    disableDuplicate: true,
    components: {
      views: {
        list: {
          Component: '@/components/admin/UsersListView#UsersListView',
        },
      },
    },
  },
  fields: [
    {
      name: 'role',
      label: 'Rola',
      type: 'select',
      required: true,
      defaultValue: 'staff',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Obsługa', value: 'staff' },
      ],
    },
  ],
  access: {
    create: isAdmin,
    delete: isAdmin,
    update: isAdmin,
    read: isStaffOrAdmin,
  },
}
