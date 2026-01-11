import type { GlobalConfig } from 'payload'

const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: 'Ustawienia strony',
  access: { read: () => true, update: isStaffOrAdmin },
  fields: [
    { name: 'name', label: 'Nazwa obiektu', type: 'text', required: true },
    { name: 'slogan', label: 'Slogan', type: 'text' },
    { name: 'description', label: 'Opis', type: 'textarea' },
    { name: 'phone', label: 'Telefon', type: 'text' },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'address', label: 'Adres', type: 'textarea' },
    { name: 'facebook', label: 'Facebook', type: 'text' },
    { name: 'instagram', label: 'Instagram', type: 'text' },
    { name: 'openingHours', label: 'Godziny otwarcia (JSON)', type: 'json' },
  ],
}
