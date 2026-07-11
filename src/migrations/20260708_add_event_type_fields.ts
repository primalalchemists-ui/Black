import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ALTER TYPE ADD VALUE musi być poza transakcją (PostgreSQL < 12)
  await db.execute(sql`
    ALTER TYPE "public"."enum_reservations_type" ADD VALUE IF NOT EXISTS 'impreza';
  `)

  // Tworzenie nowego enum dla pola eventType
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_event_type" AS ENUM('impreza', 'biznes');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `)

  // Nowe kolumny w tabeli events
  await db.execute(sql`
    ALTER TABLE "public"."events"
      ADD COLUMN IF NOT EXISTS "event_type" "public"."enum_events_event_type",
      ADD COLUMN IF NOT EXISTS "show_on_homepage" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "blocks_venue" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "block_all_day" boolean NOT NULL DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."events"
      DROP COLUMN IF EXISTS "block_all_day",
      DROP COLUMN IF EXISTS "blocks_venue",
      DROP COLUMN IF EXISTS "show_on_homepage",
      DROP COLUMN IF EXISTS "event_type";
  `)
  // enum_events_event_type można usunąć po usunięciu kolumny
  await db.execute(sql`
    DROP TYPE IF EXISTS "public"."enum_events_event_type";
  `)
  // Uwaga: usunięcie 'impreza' z enum_reservations_type wymaga odtworzenia enuma
  // i nie jest możliwe bezpośrednio w PostgreSQL - pomijamy w down()
}
