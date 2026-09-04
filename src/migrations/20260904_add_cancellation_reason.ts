import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Dodaje nullable pole `cancellationReason` do rezerwacji.
 *
 * Osobna migracja od 20260904_add_expired_payment_status — każda migracja
 * Payload biegnie we własnej transakcji, a nowo dodanej wartości enuma nie
 * wolno użyć w transakcji, w której ją dodano. Rozdzielenie plików zdejmuje
 * ten problem raz na zawsze.
 *
 * BEZ BACKFILLU. Rekordy historyczne zostają z NULL — to poprawny stan
 * "nieznany powód", nie brak danych do uzupełnienia.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_reservations_cancellation_reason" AS ENUM(
        'payment_expired',
        'payment_failed',
        'cancelled_by_customer',
        'cancelled_by_staff',
        'cancelled_by_system'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `)

  await db.execute(sql`
    ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "cancellation_reason" "public"."enum_reservations_cancellation_reason";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "reservations" DROP COLUMN IF EXISTS "cancellation_reason";
  `)

  await db.execute(sql`
    DROP TYPE IF EXISTS "public"."enum_reservations_cancellation_reason";
  `)
}
