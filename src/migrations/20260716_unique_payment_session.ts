import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Usuń duplikaty (jeśli istnieją) przed nałożeniem UNIQUE — zachowaj najnowszy rekord
  await db.execute(sql`
    DELETE FROM payments p1
    USING payments p2
    WHERE p1.p24_session_id = p2.p24_session_id
      AND p1.p24_session_id IS NOT NULL
      AND p1.id < p2.id;
  `)

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS payments_p24_session_id_unique
    ON payments (p24_session_id)
    WHERE p24_session_id IS NOT NULL;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS payments_p24_session_id_unique;
  `)
}
