import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_start_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_events_start_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_events_end_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_events_end_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_reservations_start_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_reservations_start_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_reservations_end_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_reservations_end_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_occasional_inquiries_start_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_occasional_inquiries_start_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_occasional_inquiries_end_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_occasional_inquiries_end_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_blackouts_start_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_blackouts_start_minute" AS ENUM('0', '15', '30', '45');
  CREATE TYPE "public"."enum_blackouts_end_hour" AS ENUM('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23');
  CREATE TYPE "public"."enum_blackouts_end_minute" AS ENUM('0', '15', '30', '45');
  ALTER TABLE "resources" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_resources_type";
  CREATE TYPE "public"."enum_resources_type" AS ENUM('lane', 'billiard');
  ALTER TABLE "resources" ALTER COLUMN "type" SET DATA TYPE "public"."enum_resources_type" USING "type"::"public"."enum_resources_type";
  ALTER TABLE "blackouts" ALTER COLUMN "service" SET DATA TYPE text;
  DROP TYPE "public"."enum_blackouts_service";
  CREATE TYPE "public"."enum_blackouts_service" AS ENUM('bowling', 'billiard');
  ALTER TABLE "blackouts" ALTER COLUMN "service" SET DATA TYPE "public"."enum_blackouts_service" USING "service"::"public"."enum_blackouts_service";
  ALTER TABLE "events" ADD COLUMN "price_p_l_n" numeric;
  ALTER TABLE "events" ADD COLUMN "day" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "events" ADD COLUMN "all_day" boolean DEFAULT false;
  ALTER TABLE "events" ADD COLUMN "start_hour" "enum_events_start_hour" DEFAULT '18';
  ALTER TABLE "events" ADD COLUMN "start_minute" "enum_events_start_minute" DEFAULT '0';
  ALTER TABLE "events" ADD COLUMN "end_hour" "enum_events_end_hour";
  ALTER TABLE "events" ADD COLUMN "end_minute" "enum_events_end_minute";
  ALTER TABLE "reservations" ADD COLUMN "day" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "reservations" ADD COLUMN "all_day" boolean DEFAULT false;
  ALTER TABLE "reservations" ADD COLUMN "start_hour" "enum_reservations_start_hour" DEFAULT '18';
  ALTER TABLE "reservations" ADD COLUMN "start_minute" "enum_reservations_start_minute" DEFAULT '0';
  ALTER TABLE "reservations" ADD COLUMN "end_hour" "enum_reservations_end_hour";
  ALTER TABLE "reservations" ADD COLUMN "end_minute" "enum_reservations_end_minute";
  ALTER TABLE "occasional_inquiries" ADD COLUMN "all_day" boolean DEFAULT false;
  ALTER TABLE "occasional_inquiries" ADD COLUMN "start_hour" "enum_occasional_inquiries_start_hour" DEFAULT '18';
  ALTER TABLE "occasional_inquiries" ADD COLUMN "start_minute" "enum_occasional_inquiries_start_minute" DEFAULT '0';
  ALTER TABLE "occasional_inquiries" ADD COLUMN "end_hour" "enum_occasional_inquiries_end_hour";
  ALTER TABLE "occasional_inquiries" ADD COLUMN "end_minute" "enum_occasional_inquiries_end_minute";
  ALTER TABLE "occasional_inquiries" ADD COLUMN "starts_at" timestamp(3) with time zone;
  ALTER TABLE "occasional_inquiries" ADD COLUMN "ends_at" timestamp(3) with time zone;
  ALTER TABLE "blackouts" ADD COLUMN "day" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "blackouts" ADD COLUMN "start_hour" "enum_blackouts_start_hour" DEFAULT '0';
  ALTER TABLE "blackouts" ADD COLUMN "start_minute" "enum_blackouts_start_minute" DEFAULT '0';
  ALTER TABLE "blackouts" ADD COLUMN "end_hour" "enum_blackouts_end_hour" DEFAULT '23';
  ALTER TABLE "blackouts" ADD COLUMN "end_minute" "enum_blackouts_end_minute" DEFAULT '0';
  ALTER TABLE "blackouts" DROP COLUMN "starts_at";
  ALTER TABLE "blackouts" DROP COLUMN "ends_at";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_resources_type" ADD VALUE 'table' BEFORE 'lane';
  ALTER TYPE "public"."enum_blackouts_service" ADD VALUE 'table' BEFORE 'bowling';
  ALTER TYPE "public"."enum_blackouts_service" ADD VALUE 'business';
  ALTER TABLE "blackouts" ADD COLUMN "starts_at" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "blackouts" ADD COLUMN "ends_at" timestamp(3) with time zone NOT NULL;
  ALTER TABLE "events" DROP COLUMN "price_p_l_n";
  ALTER TABLE "events" DROP COLUMN "day";
  ALTER TABLE "events" DROP COLUMN "all_day";
  ALTER TABLE "events" DROP COLUMN "start_hour";
  ALTER TABLE "events" DROP COLUMN "start_minute";
  ALTER TABLE "events" DROP COLUMN "end_hour";
  ALTER TABLE "events" DROP COLUMN "end_minute";
  ALTER TABLE "reservations" DROP COLUMN "day";
  ALTER TABLE "reservations" DROP COLUMN "all_day";
  ALTER TABLE "reservations" DROP COLUMN "start_hour";
  ALTER TABLE "reservations" DROP COLUMN "start_minute";
  ALTER TABLE "reservations" DROP COLUMN "end_hour";
  ALTER TABLE "reservations" DROP COLUMN "end_minute";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "all_day";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "start_hour";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "start_minute";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "end_hour";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "end_minute";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "starts_at";
  ALTER TABLE "occasional_inquiries" DROP COLUMN "ends_at";
  ALTER TABLE "blackouts" DROP COLUMN "day";
  ALTER TABLE "blackouts" DROP COLUMN "start_hour";
  ALTER TABLE "blackouts" DROP COLUMN "start_minute";
  ALTER TABLE "blackouts" DROP COLUMN "end_hour";
  ALTER TABLE "blackouts" DROP COLUMN "end_minute";
  DROP TYPE "public"."enum_events_start_hour";
  DROP TYPE "public"."enum_events_start_minute";
  DROP TYPE "public"."enum_events_end_hour";
  DROP TYPE "public"."enum_events_end_minute";
  DROP TYPE "public"."enum_reservations_start_hour";
  DROP TYPE "public"."enum_reservations_start_minute";
  DROP TYPE "public"."enum_reservations_end_hour";
  DROP TYPE "public"."enum_reservations_end_minute";
  DROP TYPE "public"."enum_occasional_inquiries_start_hour";
  DROP TYPE "public"."enum_occasional_inquiries_start_minute";
  DROP TYPE "public"."enum_occasional_inquiries_end_hour";
  DROP TYPE "public"."enum_occasional_inquiries_end_minute";
  DROP TYPE "public"."enum_blackouts_start_hour";
  DROP TYPE "public"."enum_blackouts_start_minute";
  DROP TYPE "public"."enum_blackouts_end_hour";
  DROP TYPE "public"."enum_blackouts_end_minute";`)
}
