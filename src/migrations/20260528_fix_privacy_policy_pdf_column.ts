import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "reservation_settings" DROP CONSTRAINT IF EXISTS "reservation_settings_privacy_policy_pdf_id_media_id_fk";
    DROP INDEX IF EXISTS "reservation_settings_privacy_policy_pdf_idx";
    ALTER TABLE "reservation_settings" DROP COLUMN IF EXISTS "privacy_policy_pdf_id";
    ALTER TABLE "reservation_settings" ADD COLUMN "privacy_policy_pdf_id" integer;
    ALTER TABLE "reservation_settings" ADD CONSTRAINT "reservation_settings_privacy_policy_pdf_id_media_id_fk"
      FOREIGN KEY ("privacy_policy_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "reservation_settings_privacy_policy_pdf_idx" ON "reservation_settings" USING btree ("privacy_policy_pdf_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "reservation_settings" DROP CONSTRAINT IF EXISTS "reservation_settings_privacy_policy_pdf_id_media_id_fk";
    DROP INDEX IF EXISTS "reservation_settings_privacy_policy_pdf_idx";
    ALTER TABLE "reservation_settings" DROP COLUMN IF EXISTS "privacy_policy_pdf_id";
  `)
}
