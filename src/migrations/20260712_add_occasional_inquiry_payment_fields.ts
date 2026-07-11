import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "occasional_inquiries"
      ADD COLUMN IF NOT EXISTS "payment_deposit_paid" boolean DEFAULT false;

    ALTER TABLE "occasional_inquiries"
      ADD COLUMN IF NOT EXISTS "payment_total_paid" boolean DEFAULT false;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "occasional_inquiries"
      DROP COLUMN IF EXISTS "payment_deposit_paid";

    ALTER TABLE "occasional_inquiries"
      DROP COLUMN IF EXISTS "payment_total_paid";
  `)
}
