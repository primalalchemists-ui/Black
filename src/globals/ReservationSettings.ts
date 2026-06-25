import type { GlobalConfig } from 'payload'

const isStaffOrAdmin = ({ req }: any) => ['admin', 'staff'].includes(req.user?.role)

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
            description: 'Np. "Rezerwacje stolików są chwilowo wyłączone. Zadzwoń do nas."',
          },
        },

        {
          type: 'number',
          name: 'availableTablesCount',
          label: 'Limit miejsc dla rezerwacji online',
          required: true,
          defaultValue: 12,
          min: 0,
          admin: {
            description:
              'Maksymalna liczba osób, które mogą mieć aktywną rezerwację online w tym samym czasie. To nie jest liczba fizycznych stolików.',
          },
        },

        {
          type: 'number',
          name: 'arrivalWindowBeforeMinutes',
          label: 'Czas blokady rezerwacji stolika (minuty)',
          defaultValue: 120,
          min: 0,
          max: 480,
          admin: {
            description:
              'Przez ile minut miejsca są blokowane po wybranej godzinie rezerwacji. Zalecane: 120.',
          },
        },
        {
          type: 'number',
          name: 'arrivalWindowAfterMinutes',
          label: 'Okno obciążenia – minuty wprzód (nieużywane)',
          defaultValue: 0,
          min: 0,
          max: 240,
          admin: {
            hidden: true,
          },
        },

        {
          type: 'number',
          name: 'depositAmount',
          label: 'Zaliczka za stoliki (PLN) – nieużywana',
          defaultValue: 200,
          min: 0,
          admin: { hidden: true },
        },
        {
          type: 'number',
          name: 'depositFromTablesCount',
          label: 'Zaliczka obowiązuje od ilu osób',
          defaultValue: 2,
          min: 1,
        },
        {
          type: 'number',
          name: 'reservationStartAfterOpeningMinutes',
          label: 'Rezerwacje możliwe od (minut po otwarciu)',
          defaultValue: 0,
          min: 0,
          max: 240,
        },
        {
          type: 'number',
          name: 'latestReservationStartBeforeClosingMinutes',
          label: 'Najpóźniejszy start rezerwacji (minut przed zamknięciem)',
          defaultValue: 120,
          min: 0,
          max: 480,
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
            description: 'Np. "Rezerwacje bilarda są chwilowo wyłączone. Zadzwoń do nas."',
          },
        },

        {
          type: 'number',
          name: 'pricePerHour',
          label: 'Cena za godzinę bilarda (PLN)',
          required: true,
          defaultValue: 50,
          min: 0,
        },
        {
          type: 'number',
          name: 'reservationStartAfterOpeningMinutes',
          label: 'Rezerwacje możliwe od (minut po otwarciu)',
          defaultValue: 0,
          min: 0,
          max: 240,
        },
        {
          type: 'number',
          name: 'latestReservationStartBeforeClosingMinutes',
          label: 'Najpóźniejszy start rezerwacji (minut przed zamknięciem)',
          defaultValue: 60,
          min: 0,
          max: 480,
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
            description: 'Np. "Rezerwacje kręgli są chwilowo wyłączone. Zadzwoń do nas."',
          },
        },

        {
          type: 'number',
          name: 'pricePerHour',
          label: 'Cena za godzinę toru (PLN)',
          required: true,
          defaultValue: 120,
          min: 0,
        },
        {
          type: 'number',
          name: 'reservationStartAfterOpeningMinutes',
          label: 'Rezerwacje możliwe od (minut po otwarciu)',
          defaultValue: 0,
          min: 0,
          max: 240,
        },
        {
          type: 'number',
          name: 'latestReservationStartBeforeClosingMinutes',
          label: 'Najpóźniejszy start rezerwacji (minut przed zamknięciem)',
          defaultValue: 60,
          min: 0,
          max: 480,
        },
      ],
    },

    /**
     * =========================
     * DOKUMENTY (PDF)
     * =========================
     */
    {
      type: 'upload',
      name: 'regulationsPdf',
      label: 'Regulamin obiektu (PDF)',
      relationTo: 'media',
      admin: {
        description: 'Plik PDF z regulaminem. Będzie dostępny do pobrania przy rezerwacji.',
      },
    },
    {
      type: 'upload',
      name: 'privacyPolicyPdf',
      label: 'Polityka prywatności (PDF)',
      relationTo: 'media',
      admin: {
        description:
          'Plik PDF z polityką prywatności. Będzie dostępny do pobrania przy rezerwacji.',
      },
    },
  ],
}
