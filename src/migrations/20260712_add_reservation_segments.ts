import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "reservations_segments" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "resource_id" integer,
      "start_hour" numeric,
      "start_minute" numeric DEFAULT 0,
      "end_hour" numeric,
      "end_minute" numeric DEFAULT 0,
      "price" numeric
    );

    ALTER TABLE "reservations_segments"
      ADD CONSTRAINT "reservations_segments_resource_id_resources_id_fk"
      FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id")
      ON DELETE set null ON UPDATE no action;

    ALTER TABLE "reservations_segments"
      ADD CONSTRAINT "reservations_segments_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."reservations"("id")
      ON DELETE cascade ON UPDATE no action;

    CREATE INDEX "reservations_segments_order_idx"
      ON "reservations_segments" USING btree ("_order");

    CREATE INDEX "reservations_segments_parent_id_idx"
      ON "reservations_segments" USING btree ("_parent_id");

    CREATE INDEX "reservations_segments_resource_id_idx"
      ON "reservations_segments" USING btree ("resource_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "reservations_segments" CASCADE;
  `)
}
