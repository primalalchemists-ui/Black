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
          label: 'Liczba stolików dostępnych do rezerwacji',
          required: true,
          defaultValue: 12,
          min: 0,
        },

        /**
         * Okno obciążenia (rolling window) dla stolików:
         * liczymy zajętość jako sumę rezerwacji w oknie [T - before, T + after)
         */
        {
          type: 'number',
          name: 'arrivalWindowBeforeMinutes',
          label: 'Okno obciążenia – minuty wstecz (dla dostępności)',
          defaultValue: 60,
          min: 0,
          max: 240,
          admin: {
            description:
              'Ile minut WSTECZ liczyć rezerwacje przy sprawdzaniu dostępności (np. 60).',
          },
        },
        {
          type: 'number',
          name: 'arrivalWindowAfterMinutes',
          label: 'Okno obciążenia – minuty wprzód (dla dostępności)',
          defaultValue: 0,
          min: 0,
          max: 240,
          admin: {
            description:
              'Ile minut WPRZÓD liczyć rezerwacje przy sprawdzaniu dostępności (np. 0 albo 30).',
          },
        },

        {
          type: 'number',
          name: 'depositAmount',
          label: 'Zaliczka za stoliki (PLN)',
          defaultValue: 200,
          min: 0,
        },
        {
          type: 'number',
          name: 'depositFromTablesCount',
          label: 'Zaliczka obowiązuje od ilu stolików',
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
