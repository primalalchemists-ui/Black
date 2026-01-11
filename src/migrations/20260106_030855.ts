import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'staff');
  CREATE TYPE "public"."enum_events_kind" AS ENUM('promo', 'business', 'party', 'sport');
  CREATE TYPE "public"."enum_events_status" AS ENUM('planned', 'cancelled');
  CREATE TYPE "public"."enum_resources_type" AS ENUM('table', 'lane', 'billiard');
  CREATE TYPE "public"."enum_reservations_type" AS ENUM('stolik', 'kregle', 'bilard', 'biznes');
  CREATE TYPE "public"."enum_reservations_source" AS ENUM('online', 'phone', 'staff');
  CREATE TYPE "public"."enum_reservations_status" AS ENUM('new', 'confirmed', 'cancelled', 'no_show', 'completed');
  CREATE TYPE "public"."enum_reservations_payment_status" AS ENUM('not_required', 'pending', 'paid', 'failed', 'refunded', 'forfeited');
  CREATE TYPE "public"."enum_reservations_payment_provider" AS ENUM('p24');
  CREATE TYPE "public"."enum_occasional_inquiries_type" AS ENUM('komunia', 'stypa', 'urodziny', 'inne');
  CREATE TYPE "public"."enum_occasional_inquiries_status" AS ENUM('new', 'in_progress', 'confirmed', 'rejected');
  CREATE TYPE "public"."enum_payments_provider" AS ENUM('p24');
  CREATE TYPE "public"."enum_payments_status" AS ENUM('pending', 'paid', 'failed', 'refunded');
  CREATE TYPE "public"."enum_blackouts_service" AS ENUM('table', 'bowling', 'billiard', 'business');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"role" "enum_users_role" DEFAULT 'staff' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"kind" "enum_events_kind" DEFAULT 'promo' NOT NULL,
  	"status" "enum_events_status" DEFAULT 'planned' NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"image_id" integer,
  	"capacity" numeric,
  	"registrations_enabled" boolean DEFAULT true,
  	"published" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "menu_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "menu_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"image_id" integer,
  	"category_id" integer NOT NULL,
  	"price" numeric NOT NULL,
  	"promo_enabled" boolean DEFAULT false,
  	"promo_promo_price" numeric,
  	"promo_starts_at" timestamp(3) with time zone,
  	"promo_ends_at" timestamp(3) with time zone,
  	"order" numeric DEFAULT 0,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "resources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_resources_type" NOT NULL,
  	"number" numeric NOT NULL,
  	"label" varchar NOT NULL,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reservations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_reservations_type" NOT NULL,
  	"customer_first_name" varchar NOT NULL,
  	"customer_last_name" varchar NOT NULL,
  	"customer_phone" varchar NOT NULL,
  	"customer_email" varchar NOT NULL,
  	"notes" varchar,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"party_size" numeric,
  	"tables_count" numeric,
  	"event_id" integer,
  	"disabled_person" boolean DEFAULT false,
  	"disability_details" varchar,
  	"invoice_want_invoice" boolean DEFAULT false,
  	"invoice_nip" varchar,
  	"accept_rules" boolean DEFAULT false NOT NULL,
  	"source" "enum_reservations_source" DEFAULT 'online' NOT NULL,
  	"status" "enum_reservations_status" DEFAULT 'new' NOT NULL,
  	"deposit_required" boolean DEFAULT false,
  	"deposit_amount" numeric,
  	"payment_status" "enum_reservations_payment_status" DEFAULT 'not_required' NOT NULL,
  	"payment_provider" "enum_reservations_payment_provider",
  	"payment_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "reservations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"resources_id" integer
  );
  
  CREATE TABLE "occasional_inquiries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_occasional_inquiries_type" NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"people" numeric,
  	"name" varchar NOT NULL,
  	"phone" varchar NOT NULL,
  	"email" varchar,
  	"notes" varchar,
  	"status" "enum_occasional_inquiries_status" DEFAULT 'new' NOT NULL,
  	"payment_paid" boolean DEFAULT false,
  	"payment_deposit_amount" numeric,
  	"payment_total_amount" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "enum_payments_provider" DEFAULT 'p24' NOT NULL,
  	"status" "enum_payments_status" DEFAULT 'pending' NOT NULL,
  	"amount" numeric NOT NULL,
  	"currency" varchar DEFAULT 'PLN',
  	"p24_session_id" varchar,
  	"p24_order_id" varchar,
  	"p24_sign" varchar,
  	"reservation_id" integer,
  	"raw" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "blackouts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"service" "enum_blackouts_service" NOT NULL,
  	"all_day" boolean DEFAULT false,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone NOT NULL,
  	"reason" varchar,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "blackouts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"resources_id" integer
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"media_id" integer,
  	"events_id" integer,
  	"menu_categories_id" integer,
  	"menu_items_id" integer,
  	"resources_id" integer,
  	"reservations_id" integer,
  	"occasional_inquiries_id" integer,
  	"payments_id" integer,
  	"blackouts_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slogan" varchar,
  	"description" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"address" varchar,
  	"facebook" varchar,
  	"instagram" varchar,
  	"opening_hours" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
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
  
  CREATE TABLE "dish_of_day" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"item_id" integer,
  	"custom_title" varchar,
  	"custom_description" varchar,
  	"valid_until" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "reservation_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"table_deposit_amount" numeric DEFAULT 200,
  	"table_deposit_from_tables_count" numeric DEFAULT 2,
  	"bowling_price_per_hour" numeric DEFAULT 0,
  	"bowling_no_show_minutes" numeric DEFAULT 15,
  	"default_buffer_minutes" numeric DEFAULT 15,
  	"regulations_text" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_menu_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."menu_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reservations_rels" ADD CONSTRAINT "reservations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "reservations_rels" ADD CONSTRAINT "reservations_rels_resources_fk" FOREIGN KEY ("resources_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "blackouts_rels" ADD CONSTRAINT "blackouts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."blackouts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "blackouts_rels" ADD CONSTRAINT "blackouts_rels_resources_fk" FOREIGN KEY ("resources_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menu_categories_fk" FOREIGN KEY ("menu_categories_id") REFERENCES "public"."menu_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menu_items_fk" FOREIGN KEY ("menu_items_id") REFERENCES "public"."menu_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_resources_fk" FOREIGN KEY ("resources_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reservations_fk" FOREIGN KEY ("reservations_id") REFERENCES "public"."reservations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_occasional_inquiries_fk" FOREIGN KEY ("occasional_inquiries_id") REFERENCES "public"."occasional_inquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blackouts_fk" FOREIGN KEY ("blackouts_id") REFERENCES "public"."blackouts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_page_offer_tiles" ADD CONSTRAINT "home_page_offer_tiles_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "home_page_offer_tiles" ADD CONSTRAINT "home_page_offer_tiles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."home_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "home_page" ADD CONSTRAINT "home_page_featured_event_id_events_id_fk" FOREIGN KEY ("featured_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "dish_of_day" ADD CONSTRAINT "dish_of_day_item_id_menu_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."menu_items"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "events_image_idx" ON "events" USING btree ("image_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "menu_categories_updated_at_idx" ON "menu_categories" USING btree ("updated_at");
  CREATE INDEX "menu_categories_created_at_idx" ON "menu_categories" USING btree ("created_at");
  CREATE INDEX "menu_items_image_idx" ON "menu_items" USING btree ("image_id");
  CREATE INDEX "menu_items_category_idx" ON "menu_items" USING btree ("category_id");
  CREATE INDEX "menu_items_updated_at_idx" ON "menu_items" USING btree ("updated_at");
  CREATE INDEX "menu_items_created_at_idx" ON "menu_items" USING btree ("created_at");
  CREATE INDEX "resources_updated_at_idx" ON "resources" USING btree ("updated_at");
  CREATE INDEX "resources_created_at_idx" ON "resources" USING btree ("created_at");
  CREATE UNIQUE INDEX "type_number_idx" ON "resources" USING btree ("type","number");
  CREATE INDEX "reservations_event_idx" ON "reservations" USING btree ("event_id");
  CREATE INDEX "reservations_payment_idx" ON "reservations" USING btree ("payment_id");
  CREATE INDEX "reservations_updated_at_idx" ON "reservations" USING btree ("updated_at");
  CREATE INDEX "reservations_created_at_idx" ON "reservations" USING btree ("created_at");
  CREATE INDEX "reservations_rels_order_idx" ON "reservations_rels" USING btree ("order");
  CREATE INDEX "reservations_rels_parent_idx" ON "reservations_rels" USING btree ("parent_id");
  CREATE INDEX "reservations_rels_path_idx" ON "reservations_rels" USING btree ("path");
  CREATE INDEX "reservations_rels_resources_id_idx" ON "reservations_rels" USING btree ("resources_id");
  CREATE INDEX "occasional_inquiries_updated_at_idx" ON "occasional_inquiries" USING btree ("updated_at");
  CREATE INDEX "occasional_inquiries_created_at_idx" ON "occasional_inquiries" USING btree ("created_at");
  CREATE INDEX "payments_reservation_idx" ON "payments" USING btree ("reservation_id");
  CREATE INDEX "payments_updated_at_idx" ON "payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");
  CREATE INDEX "blackouts_updated_at_idx" ON "blackouts" USING btree ("updated_at");
  CREATE INDEX "blackouts_created_at_idx" ON "blackouts" USING btree ("created_at");
  CREATE INDEX "blackouts_rels_order_idx" ON "blackouts_rels" USING btree ("order");
  CREATE INDEX "blackouts_rels_parent_idx" ON "blackouts_rels" USING btree ("parent_id");
  CREATE INDEX "blackouts_rels_path_idx" ON "blackouts_rels" USING btree ("path");
  CREATE INDEX "blackouts_rels_resources_id_idx" ON "blackouts_rels" USING btree ("resources_id");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_menu_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("menu_categories_id");
  CREATE INDEX "payload_locked_documents_rels_menu_items_id_idx" ON "payload_locked_documents_rels" USING btree ("menu_items_id");
  CREATE INDEX "payload_locked_documents_rels_resources_id_idx" ON "payload_locked_documents_rels" USING btree ("resources_id");
  CREATE INDEX "payload_locked_documents_rels_reservations_id_idx" ON "payload_locked_documents_rels" USING btree ("reservations_id");
  CREATE INDEX "payload_locked_documents_rels_occasional_inquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("occasional_inquiries_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "payload_locked_documents_rels_blackouts_id_idx" ON "payload_locked_documents_rels" USING btree ("blackouts_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "home_page_offer_tiles_order_idx" ON "home_page_offer_tiles" USING btree ("_order");
  CREATE INDEX "home_page_offer_tiles_parent_id_idx" ON "home_page_offer_tiles" USING btree ("_parent_id");
  CREATE INDEX "home_page_offer_tiles_image_idx" ON "home_page_offer_tiles" USING btree ("image_id");
  CREATE INDEX "home_page_featured_event_idx" ON "home_page" USING btree ("featured_event_id");
  CREATE INDEX "dish_of_day_item_idx" ON "dish_of_day" USING btree ("item_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "menu_categories" CASCADE;
  DROP TABLE "menu_items" CASCADE;
  DROP TABLE "resources" CASCADE;
  DROP TABLE "reservations" CASCADE;
  DROP TABLE "reservations_rels" CASCADE;
  DROP TABLE "occasional_inquiries" CASCADE;
  DROP TABLE "payments" CASCADE;
  DROP TABLE "blackouts" CASCADE;
  DROP TABLE "blackouts_rels" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TABLE "home_page_offer_tiles" CASCADE;
  DROP TABLE "home_page" CASCADE;
  DROP TABLE "dish_of_day" CASCADE;
  DROP TABLE "reservation_settings" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_events_kind";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum_resources_type";
  DROP TYPE "public"."enum_reservations_type";
  DROP TYPE "public"."enum_reservations_source";
  DROP TYPE "public"."enum_reservations_status";
  DROP TYPE "public"."enum_reservations_payment_status";
  DROP TYPE "public"."enum_reservations_payment_provider";
  DROP TYPE "public"."enum_occasional_inquiries_type";
  DROP TYPE "public"."enum_occasional_inquiries_status";
  DROP TYPE "public"."enum_payments_provider";
  DROP TYPE "public"."enum_payments_status";
  DROP TYPE "public"."enum_blackouts_service";`)
}
