import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE SEQUENCE IF NOT EXISTS "reservation_number_seq"
      START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

    ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "group_id" text;

    ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "reservation_number" text;

    CREATE UNIQUE INDEX IF NOT EXISTS "reservations_reservation_number_unique"
      ON "reservations"("reservation_number")
      WHERE "reservation_number" IS NOT NULL;

    CREATE INDEX IF NOT EXISTS "reservations_group_id_idx"
      ON "reservations"("group_id")
      WHERE "group_id" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "reservations_group_id_idx";
    DROP INDEX IF EXISTS "reservations_reservation_number_unique";
    ALTER TABLE "reservations" DROP COLUMN IF EXISTS "reservation_number";
    ALTER TABLE "reservations" DROP COLUMN IF EXISTS "group_id";
    DROP SEQUENCE IF EXISTS "reservation_number_seq";
  `)
}
