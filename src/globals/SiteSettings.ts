import type { GlobalConfig } from 'payload'

const isAdmin = ({ req }: any) => req.user?.role === 'admin'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Ustawienia strony',
  admin: { group: 'Ustawienia' },
  access: { read: () => true, update: isAdmin },
  fields: [
    { name: 'name', label: 'Nazwa obiektu', type: 'text', required: true },
    { name: 'slogan', label: 'Slogan', type: 'text' },
    { name: 'description', label: 'Opis', type: 'textarea' },
    { name: 'phone', label: 'Telefon', type: 'text' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'address', label: 'Adres', type: 'textarea' },
    { name: 'nip', label: 'NIP', type: 'text' },
    { name: 'facebook', label: 'Facebook', type: 'text' },
    { name: 'instagram', label: 'Instagram', type: 'text' },
    {
      name: 'openingHours',
      label: 'Godziny otwarcia',
      type: 'json',
      admin: {
        components: {
          Field: '@/components/admin/OpeningHoursField#OpeningHoursField',
        },
      },
    },
  ],
}
