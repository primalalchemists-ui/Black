import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Dodaj nowe wartości do enum kind (nie da się usunąć starych z Postgres bez DROP/RECREATE)
  await db.execute(sql`
    ALTER TYPE "public"."enum_events_kind" ADD VALUE IF NOT EXISTS 'impreza';
  `)
  await db.execute(sql`
    ALTER TYPE "public"."enum_events_kind" ADD VALUE IF NOT EXISTS 'biznes';
  `)

  // Cleanup: usuń kolumnę event_type i enum dodane przez poprzednią migrację
  await db.execute(sql`
    ALTER TABLE "public"."events"
      DROP COLUMN IF EXISTS "event_type";
  `)
  await db.execute(sql`
    DROP TYPE IF EXISTS "public"."enum_events_event_type";
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Uwaga: usunięcie impreza/biznes z enum_events_kind nie jest możliwe bezpośrednio w Postgres
  // down() pomija cofnięcie ADD VALUE
}
