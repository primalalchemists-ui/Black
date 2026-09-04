import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Dodaje wartość 'expired' do enumów statusu płatności.
 *
 * 'expired' = klient rozpoczął płatność, ale nie dokończył jej w wymaganym
 * czasie. Świadomie ODRĘBNA od 'failed' (rzeczywisty błąd/odrzucenie
 * po stronie operatora płatności).
 *
 * UWAGA (PostgreSQL): ALTER TYPE ... ADD VALUE jest dozwolone w transakcji
 * od PG 12, ale nowej wartości NIE WOLNO użyć w tej samej transakcji.
 * Dlatego ta migracja WYŁĄCZNIE dodaje wartości — żadnego backfillu,
 * żadnego UPDATE-a używającego 'expired'. Kod aplikacji może z niej
 * korzystać dopiero po zacommitowaniu tej migracji.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_reservations_payment_status" ADD VALUE IF NOT EXISTS 'expired';
  `)

  await db.execute(sql`
    ALTER TYPE "public"."enum_payments_status" ADD VALUE IF NOT EXISTS 'expired';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Celowo pusta.
  // PostgreSQL nie pozwala usunąć wartości z enuma bez odtworzenia całego
  // typu (DROP/RECREATE + przepisanie wszystkich kolumn go używających).
  // Na żywej bazie produkcyjnej jest to operacja destrukcyjna i blokująca,
  // a nadmiarowa wartość enuma jest całkowicie nieszkodliwa.
  // Ten sam wzorzec co w 20260716_add_verifying_to_payment_status.
}
