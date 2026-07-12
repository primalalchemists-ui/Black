import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;

    CREATE INDEX IF NOT EXISTS "reservations_expires_at_idx"
      ON "reservations"("expires_at")
      WHERE "expires_at" IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "reservations_expires_at_idx";
    ALTER TABLE "reservations" DROP COLUMN IF EXISTS "expires_at";
  `)
}
