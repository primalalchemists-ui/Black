import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."enum_reservations_payment_status" ADD VALUE IF NOT EXISTS 'verifying';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // ADD VALUE w PostgreSQL jest nieodwracalne bez DROP/RECREATE całego enuma
}
