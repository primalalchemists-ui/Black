import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Migracja wyrównująca: domyka rozjazd między łańcuchem migracji
 * a konfiguracją Payload.
 *
 * ── SKĄD TA MIGRACJA ─────────────────────────────────────────────────────────
 *
 * Odtworzenie wszystkich 16 wcześniejszych migracji na PUSTEJ bazie dawało
 * schemat, którego aplikacja nie akceptowała — `GET /api/reservations/kregle`
 * kończyło się błędem `column "tables_arrival_window_before_minutes" does not exist`.
 * Część pól trafiła do konfiguracji Payload bez wygenerowania migracji
 * (prawdopodobnie przez `push` w czasie developmentu).
 *
 * ── JAK USTALONO ZAKRES ──────────────────────────────────────────────────────
 *
 * Porównano dwie jednorazowe bazy:
 *   A — pusta baza po wszystkich 16 migracjach,
 *   B — pusta baza zbudowana przez `push` wprost z konfiguracji Payload.
 *
 * Diff objął kolumny (typ, nullability, default), typy enum, indeksy
 * i ograniczenia. Wynik:
 *
 *   • 3 kolumny brakujące w A  → dodawane poniżej
 *   • 1 typ enum brakujący w A → tworzony poniżej
 *   • indeksy:     brak różnic (A ma 4 nadmiarowe, celowo dodane naszymi
 *                  migracjami: unikalność sesji P24, expires_at, group_id,
 *                  numer rezerwacji — zostają)
 *   • ograniczenia: brak różnic (52 = 52)
 *   • 2 kolumny nadmiarowe w A (`events.all_day`,
 *     `reservation_settings.tables_deposit_from_tables_count`) — pozostałości
 *     po starszej konfiguracji. NIE usuwamy ich: są nullable, mają defaulty
 *     i nic ich nie czyta. Usunięcie byłoby operacją destrukcyjną bez potrzeby.
 *
 * ── CZEGO TA MIGRACJA ŚWIADOMIE NIE ROBI ─────────────────────────────────────
 *
 * Nie zmienia nazw kolumn. Narzędzie `payload migrate:create` proponowało
 * potraktowanie `events.show_on_homepage` jako zmiany nazwy z `events.all_day`.
 * To byłoby błędne: baza A zawiera OBIE kolumny jednocześnie, więc nie jest to
 * rename, tylko osobna, przestarzała kolumna. Zgadywanie tutaj groziłoby utratą
 * danych na produkcji.
 *
 * Nie zmienia też nullability ani typów istniejących kolumn. Rozbieżności
 * (`text` vs `varchar` na group_id/internal_note/reservation_number oraz kilka
 * różnic NOT NULL) są udokumentowane w docs/STAGING.md jako osobna decyzja —
 * dotykają istniejących danych produkcyjnych i wymagają własnego przeglądu.
 *
 * ── PRODUKCJA ────────────────────────────────────────────────────────────────
 *
 * `IF NOT EXISTS` sprawia, że migracja jest no-opem tam, gdzie kolumny już są.
 * To NIE wystarcza jako gwarancja zgodności: istniejąca kolumna może mieć inny
 * typ lub default. Przed uruchomieniem na produkcji wykonaj zapytanie
 * weryfikacyjne z docs/STAGING.md i porównaj wynik z wartościami oczekiwanymi
 * poniżej.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Typ enum dla reservations.invoice_invoice_type.
  // CREATE TYPE i użycie go w tej samej transakcji jest dozwolone — ograniczenie
  // PostgreSQL dotyczy wyłącznie ALTER TYPE ... ADD VALUE, nie tworzenia typu.
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_reservations_invoice_invoice_type" AS ENUM('personal', 'company');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `)

  // Oczekiwane: enum_reservations_invoice_invoice_type, NULL dozwolony, bez defaultu.
  await db.execute(sql`
    ALTER TABLE "reservations"
      ADD COLUMN IF NOT EXISTS "invoice_invoice_type" "public"."enum_reservations_invoice_invoice_type";
  `)

  // Oczekiwane: numeric, NULL dozwolony, default 120.
  await db.execute(sql`
    ALTER TABLE "reservation_settings"
      ADD COLUMN IF NOT EXISTS "tables_arrival_window_before_minutes" numeric DEFAULT 120;
  `)

  // Oczekiwane: numeric, NULL dozwolony, default 0.
  await db.execute(sql`
    ALTER TABLE "reservation_settings"
      ADD COLUMN IF NOT EXISTS "tables_arrival_window_after_minutes" numeric DEFAULT 0;
  `)
}

/** Jawna zgoda wymagana do wycofania tej migracji. */
const ROLLBACK_OPT_IN = "ALLOW_CATCHUP_SCHEMA_ROLLBACK"

/**
 * Rollback DOMYŚLNIE ODMAWIA DZIAŁANIA.
 *
 * `up` używa `ADD COLUMN IF NOT EXISTS`, więc na bazie, która te kolumny już
 * miała (np. produkcja, gdzie powstały poza łańcuchem migracji przez `push`),
 * ta migracja NIE utworzyła niczego. Po fakcie nie da się odróżnić kolumny
 * utworzonej tutaj od takiej, która istniała wcześniej — a bezwarunkowy DROP
 * skasowałby wtedy dane, których ta migracja nigdy nie była właścicielem.
 *
 * Dlatego zamiast zgadywać, zatrzymujemy się (fail closed). Odblokowanie
 * wymaga świadomej decyzji operatora po zweryfikowaniu stanu bazy.
 *
 * Nawet po odblokowaniu nie usuwamy kolumny `reservations.invoice_invoice_type`,
 * jeżeli zawiera jakiekolwiek dane — to rozstrzygający dowód, że nie jest pusta,
 * świeżo dodana przez tę migrację.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  if (process.env[ROLLBACK_OPT_IN] !== "true") {
    throw new Error(
      `Wycofanie 20261011_catchup_missing_schema jest zablokowane.\n` +
        `\n` +
        `  Powód: migracja dodawała kolumny przez ADD COLUMN IF NOT EXISTS, więc na bazie,\n` +
        `         która już je miała, nie utworzyła niczego. Nie da się ustalić, czy należą\n` +
        `         do tej migracji — bezwarunkowy DROP mógłby skasować istniejące dane.\n` +
        `\n` +
        `  Zanim odblokujesz, sprawdź (tylko odczyt), czy kolumny są puste:\n` +
        `    SELECT count(*) FILTER (WHERE invoice_invoice_type IS NOT NULL) AS uzyte_typy_faktur\n` +
        `    FROM reservations;\n` +
        `    SELECT tables_arrival_window_before_minutes, tables_arrival_window_after_minutes\n` +
        `    FROM reservation_settings;\n` +
        `\n` +
        `  Jeśli masz pewność, że to Twoje środowisko i dane są zbędne:\n` +
        `    ${ROLLBACK_OPT_IN}=true pnpm payload migrate:down\n`,
    )
  }

  const used = await db.execute(sql`
    SELECT count(*)::int AS n FROM "reservations" WHERE "invoice_invoice_type" IS NOT NULL;
  `)
  const usedCount = Number((used as unknown as { rows?: Array<{ n?: number }> }).rows?.[0]?.n ?? 0)

  if (usedCount > 0) {
    throw new Error(
      `Wycofanie przerwane: kolumna reservations.invoice_invoice_type zawiera ${usedCount} ` +
        `niepustych wartości. To dane, których ta migracja nie jest właścicielem — nie usuwam ich.`,
    )
  }

  await db.execute(sql`
    ALTER TABLE "reservation_settings" DROP COLUMN IF EXISTS "tables_arrival_window_after_minutes";
  `)
  await db.execute(sql`
    ALTER TABLE "reservation_settings" DROP COLUMN IF EXISTS "tables_arrival_window_before_minutes";
  `)
  await db.execute(sql`
    ALTER TABLE "reservations" DROP COLUMN IF EXISTS "invoice_invoice_type";
  `)
  await db.execute(sql`
    DROP TYPE IF EXISTS "public"."enum_reservations_invoice_invoice_type";
  `)
}
