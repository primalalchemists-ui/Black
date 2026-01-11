import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "home_page_offer_tiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "home_page" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "home_page_offer_tiles" CASCADE;
  DROP TABLE "home_page" CASCADE;
  ALTER TABLE "reservation_settings" ALTER COLUMN "bowling_price_per_hour" SET DEFAULT 120;
  ALTER TABLE "reservation_settings" ALTER COLUMN "bowling_price_per_hour" SET NOT NULL;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_enabled" boolean DEFAULT true;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_disabled_message" varchar;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_available_tables_count" numeric DEFAULT 12 NOT NULL;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_deposit_amount" numeric DEFAULT 200;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_deposit_from_tables_count" numeric DEFAULT 2;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_reservation_start_after_opening_minutes" numeric DEFAULT 0;
  ALTER TABLE "reservation_settings" ADD COLUMN "tables_latest_reservation_start_before_closing_minutes" numeric DEFAULT 120;
  ALTER TABLE "reservation_settings" ADD COLUMN "billiard_enabled" boolean DEFAULT true;
  ALTER TABLE "reservation_settings" ADD COLUMN "billiard_disabled_message" varchar;
  ALTER TABLE "reservation_settings" ADD COLUMN "billiard_price_per_hour" numeric DEFAULT 50 NOT NULL;
  ALTER TABLE "reservation_settings" ADD COLUMN "billiard_reservation_start_after_opening_minutes" numeric DEFAULT 0;
  ALTER TABLE "reservation_settings" ADD COLUMN "billiard_latest_reservation_start_before_closing_minutes" numeric DEFAULT 60;
  ALTER TABLE "reservation_settings" ADD COLUMN "bowling_enabled" boolean DEFAULT true;
  ALTER TABLE "reservation_settings" ADD COLUMN "bowling_disabled_message" varchar;
  ALTER TABLE "reservation_settings" ADD COLUMN "bowling_reservation_start_after_opening_minutes" numeric DEFAULT 0;
  ALTER TABLE "reservation_settings" ADD COLUMN "bowling_latest_reservation_start_before_closing_minutes" numeric DEFAULT 60;
  ALTER TABLE "reservation_settings" ADD COLUMN "regulations_pdf_id" integer;
  ALTER TABLE "reservation_settings" ADD CONSTRAINT "reservation_settings_regulations_pdf_id_media_id_fk" FOREIGN KEY ("regulations_pdf_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "reservation_settings_regulations_pdf_idx" ON "reservation_settings" USING btree ("regulations_pdf_id");
  ALTER TABLE "reservation_settings" DROP COLUMN "table_deposit_amount";
  ALTER TABLE "reservation_settings" DROP COLUMN "table_deposit_from_tables_count";
  ALTER TABLE "reservation_settings" DROP COLUMN "bowling_no_show_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "default_buffer_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "regulations_text";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "home_page_offer_tiles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"image_id" integer,
  	"href" varchar NOT NULL
  );
  
  CREATE TABLE "home_page" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"hero_title" varchar NOT NULL,
  	"hero_subtitle" varchar,
  	"hero_cta_text" varchar,
  	"hero_cta_href" varchar,
  	"featured_event_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "reservation_settings" DROP CONSTRAINT "reservation_settings_regulations_pdf_id_media_id_fk";
  
  DROP INDEX "reservation_settings_regulations_pdf_idx";
  ALTER TABLE "reservation_settings" ALTER COLUMN "bowling_price_per_hour" SET DEFAULT 0;
  ALTER TABLE "reservation_settings" ALTER COLUMN "bowling_price_per_hour" DROP NOT NULL;
  ALTER TABLE "reservation_settings" ADD COLUMN "table_deposit_amount" numeric DEFAULT 200;
  ALTER TABLE "reservation_settings" ADD COLUMN "table_deposit_from_tables_count" numeric DEFAULT 2;
  ALTER TABLE "reservation_settings" ADD COLUMN "bowling_no_show_minutes" numeric DEFAULT 15;
  ALTER TABLE "reservation_settings" ADD COLUMN "default_buffer_minutes" numeric DEFAULT 15;
  ALTER TABLE "reservation_settings" ADD COLUMN "regulations_text" varchar;
  ALTER TABLE "home_page_offer_tiles" ADD CONSTRAINT "home_page_offer_tiles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "home_page_offer_tiles" ADD CONSTRAINT "home_page_offer_tiles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."home_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_page" ADD CONSTRAINT "home_page_featured_event_id_events_id_fk" FOREIGN KEY ("featured_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "home_page_offer_tiles_order_idx" ON "home_page_offer_tiles" USING btree ("_order");
  CREATE INDEX "home_page_offer_tiles_parent_id_idx" ON "home_page_offer_tiles" USING btree ("_parent_id");
  CREATE INDEX "home_page_offer_tiles_image_idx" ON "home_page_offer_tiles" USING btree ("image_id");
  CREATE INDEX "home_page_featured_event_idx" ON "home_page" USING btree ("featured_event_id");
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_enabled";
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_disabled_message";
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_available_tables_count";
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_deposit_amount";
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_deposit_from_tables_count";
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_reservation_start_after_opening_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "tables_latest_reservation_start_before_closing_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "billiard_enabled";
  ALTER TABLE "reservation_settings" DROP COLUMN "billiard_disabled_message";
  ALTER TABLE "reservation_settings" DROP COLUMN "billiard_price_per_hour";
  ALTER TABLE "reservation_settings" DROP COLUMN "billiard_reservation_start_after_opening_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "billiard_latest_reservation_start_before_closing_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "bowling_enabled";
  ALTER TABLE "reservation_settings" DROP COLUMN "bowling_disabled_message";
  ALTER TABLE "reservation_settings" DROP COLUMN "bowling_reservation_start_after_opening_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "bowling_latest_reservation_start_before_closing_minutes";
  ALTER TABLE "reservation_settings" DROP COLUMN "regulations_pdf_id";`)
}
