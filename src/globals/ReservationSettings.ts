import type { GlobalConfig } from 'payload'

const isStaffOrAdmin = ({ req }: any) =>
  ['admin', 'staff'].includes(req.user?.role)

export const ReservationSettings: GlobalConfig = {
  slug: 'reservation-settings',
  label: 'Ustawienia rezerwacji',
  access: {
    read: isStaffOrAdmin,
    update: isStaffOrAdmin,
  },

  fields: [
    /**
     * =========================
     * STOLIKI – RESTAURACJA
     * =========================
     */
    {
      type: 'group',
      name: 'tables',
      label: 'Stoliki – restauracja',
      fields: [
        {
          type: 'checkbox',
          name: 'enabled',
          label: 'Rezerwacje stolików włączone',
          defaultValue: true,
        },
        {
          type: 'text',
          name: 'disabledMessage',
          label: 'Komunikat, gdy rezerwacje stolików są wyłączone (opcjonalnie)',
          admin: {
            description:
              'Np. "Rezerwacje stolików są chwilowo wyłączone. Zadzwoń do nas."',
          },
        },

        {
          type: 'number',
          name: 'availableTablesCount',
          label: 'Liczba stolików dostępnych do rezerwacji',
          required: true,
          defaultValue: 12, // ustaw jak chcesz
        },
        {
          type: 'number',
          name: 'depositAmount',
          label: 'Zaliczka za stoliki (PLN)',
          defaultValue: 200,
        },
        {
          type: 'number',
          name: 'depositFromTablesCount',
          label: 'Zaliczka obowiązuje od ilu stolików',
          defaultValue: 2,
        },
        {
          type: 'number',
          name: 'reservationStartAfterOpeningMinutes',
          label: 'Rezerwacje możliwe od (minut po otwarciu)',
          defaultValue: 0,
        },
        {
          type: 'number',
          name: 'latestReservationStartBeforeClosingMinutes',
          label: 'Najpóźniejszy start rezerwacji (minut przed zamknięciem)',
          defaultValue: 120,
        },
      ],
    },

    /**
     * =========================
     * BILARD
     * =========================
     */
    {
      type: 'group',
      name: 'billiard',
      label: 'Bilard',
      fields: [
        {
          type: 'checkbox',
          name: 'enabled',
          label: 'Rezerwacje bilarda włączone',
          defaultValue: true,
        },
        {
          type: 'text',
          name: 'disabledMessage',
          label: 'Komunikat, gdy rezerwacje bilarda są wyłączone (opcjonalnie)',
          admin: {
            description:
              'Np. "Rezerwacje bilarda są chwilowo wyłączone. Zadzwoń do nas."',
          },
        },

        {
          type: 'number',
          name: 'pricePerHour',
          label: 'Cena za godzinę bilarda (PLN)',
          required: true,
          defaultValue: 50, // ustaw jak chcesz
        },
        {
          type: 'number',
          name: 'reservationStartAfterOpeningMinutes',
          label: 'Rezerwacje możliwe od (minut po otwarciu)',
          defaultValue: 0,
        },
        {
          type: 'number',
          name: 'latestReservationStartBeforeClosingMinutes',
          label: 'Najpóźniejszy start rezerwacji (minut przed zamknięciem)',
          defaultValue: 60,
        },
      ],
    },

    /**
     * =========================
     * KRĘGLE
     * =========================
     */
    {
      type: 'group',
      name: 'bowling',
      label: 'Kręgle',
      fields: [
        {
          type: 'checkbox',
          name: 'enabled',
          label: 'Rezerwacje kręgli włączone',
          defaultValue: true,
        },
        {
          type: 'text',
          name: 'disabledMessage',
          label: 'Komunikat, gdy rezerwacje kręgli są wyłączone (opcjonalnie)',
          admin: {
            description:
              'Np. "Rezerwacje kręgli są chwilowo wyłączone. Zadzwoń do nas."',
          },
        },

        {
          type: 'number',
          name: 'pricePerHour',
          label: 'Cena za godzinę toru (PLN)',
          required: true,
          defaultValue: 120, // ustaw jak chcesz
        },
        {
          type: 'number',
          name: 'reservationStartAfterOpeningMinutes',
          label: 'Rezerwacje możliwe od (minut po otwarciu)',
          defaultValue: 0,
        },
        {
          type: 'number',
          name: 'latestReservationStartBeforeClosingMinutes',
          label: 'Najpóźniejszy start rezerwacji (minut przed zamknięciem)',
          defaultValue: 60,
        },
      ],
    },

    /**
     * =========================
     * REGULAMIN
     * =========================
     */
    {
      type: 'upload',
      name: 'regulationsPdf',
      label: 'Regulamin (PDF)',
      relationTo: 'media',
      admin: {
        description:
          'Plik PDF z regulaminem. Będzie dostępny do pobrania przy rezerwacji.',
      },
    },
  ],
}
