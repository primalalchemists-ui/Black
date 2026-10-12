# Staging na Railway — migracje bazy danych

Dotyczy projektu `Black-Staging` (serwis `Black-App-Staging` + serwis `Postgres`).

Ochronę dostępu do środowiska i replikację treści opisuje
[STAGING-ACCESS.md](./STAGING-ACCESS.md).

## Skrót

Migracje uruchamia **komenda Pre-deploy**:

```
node migrate.mjs
```

Nie są uruchamiane w trakcie budowania obrazu ani przy starcie aplikacji.
Każdy błąd zwraca niezerowy kod wyjścia i zatrzymuje wdrożenie.

## Dlaczego nie podczas builda

W Dockerfile było `RUN ... pnpm run migrate:deploy || true`. Sieć prywatna
Railway nie jest dostępna na etapie budowania, a `|| true` połykało każdy błąd —
migracje tą drogą nie wykonywały się wcale. Krok został usunięty.

Razem z nim usunięto `ARG DATABASE_URL` / `ENV DATABASE_URL`: były potrzebne
tylko dla tamtego kroku. `next build` nie łączy się z bazą — zweryfikowane
budowaniem obrazu bez przekazania tej zmiennej. Poświadczenia bazy nie trafiają
więc do żadnej warstwy obrazu.

## Dlaczego nie `payload migrate` w Pre-deploy

Pre-deploy działa w **zbudowanym obrazie**, a ten zawiera wyłącznie output
`next build --output standalone`. Sprawdzone w realnym obrazie:

```
$ docker run --rm --entrypoint sh <obraz> -c 'ls -1 /app/node_modules'
@aws-sdk  graphql  next  react  sharp  typescript
```

Sześć pakietów. Brak `payload`, `@payloadcms/*`, `pg` i katalogu `.bin`. Next
wkompilował te zależności w `.next/server/chunks`, a `src/migrations/*.ts` nie
jest w ogóle śledzone przez tracing, bo `payload.config.ts` ich nie importuje.
CLI Payloada jest w runtime fizycznie niedostępne.

## Rozwiązanie: `migrate.mjs`

Etap `builder` pakuje `scripts/run-migrations.ts` esbuildem do jednego
samowystarczalnego pliku, który trafia do obrazu obok `server.js`.

Logika migracji **nie jest przepisywana** — skrypt wywołuje natywne
`payload.db.migrate({ migrations })`. Adapter drizzle jawnie wspiera podanie
gotowej tablicy zamiast czytania z dysku
(`@payloadcms/drizzle/dist/migrate.js`: `args?.migrations || readMigrationFiles(...)`),
więc `payload_migrations`, transakcje i kolejność działają identycznie jak przy
`payload migrate`.

## Zabezpieczenia

Kolejność jest istotna: **wszystkie kontrole celu wykonują się na czystym
kliencie `pg`, zanim zainicjalizowany zostanie Payload** i zanim wykonana
zostanie jakakolwiek zmiana schematu.

### 1. Jawna zgoda i deklaracja celu

| Zmienna | Rola |
|---|---|
| `RUN_DB_MIGRATIONS` | Musi być dokładnie `true`. |
| `DB_ENVIRONMENT_ID` | Stały identyfikator środowiska, np. `black-staging`. |
| `DB_MIGRATION_EXPECTED_HOST` | Musi zgadzać się z hostem z `DATABASE_URL`. |
| `DB_MIGRATION_EXPECTED_DATABASE` | Musi zgadzać się z nazwą bazy z `DATABASE_URL`. |

`NODE_ENV` nie jest używany do rozróżniania środowisk — w obrazie produkcyjnym
jest `production` także na stagingu.

### 2. Trwała tożsamość bazy

Host i nazwa bazy nie odróżnią dwóch środowisk Railway, bo oba projekty mogą
mieć bazę `railway` pod `postgres.railway.internal`. Dlatego tożsamość jest
zapisywana **w samej bazie**, w tabeli `db_environment_marker`:

- **Znacznik istnieje** → musi być równy `DB_ENVIRONMENT_ID`. Inna wartość
  zatrzymuje wdrożenie.
- **Znacznika nie ma** → to może być tylko pierwsze uruchomienie, więc baza musi
  być **całkowicie pusta**. Ten wymóg jest bezwarunkowy (fail-closed) — nie da
  się go wyłączyć flagą ani o nim zapomnieć.

Produkcja ma tabele i nie ma naszego znacznika, więc pomyłkowe wycelowanie w nią
zatrzymuje się, zanim cokolwiek zostanie zmienione.

Znacznik zapisujemy **przed** migracjami. Gdyby migracja padła w połowie, baza
byłaby już niepusta — bez wcześniejszego znacznika kolejne uruchomienie utknęłoby
na wymogu pustej bazy i zablokowało naprawę.

### 3. Baza musi istnieć

Adapter Payloada **sam tworzy brakującą bazę**
(`@payloadcms/db-postgres/dist/connect.js`). Zweryfikowane: bez dodatkowej
kontroli literówka w nazwie bazy kończyła się kodem 0 po cichym założeniu
i zmigrowaniu nowej pustej bazy. Skrypt łączy się najpierw czystym klientem `pg`,
który niczego nie tworzy.

### 4. Walidacja `DATABASE_URL`

Protokół, jednoznaczny host, dokładnie jeden segment ścieżki oraz odrzucenie
parametrów libpq mogących przestawić cel połączenia (`dbname`, `host`,
`hostaddr`, `port`, `service`, `options`).

Logi pokazują wyłącznie `host:port/baza` — nigdy użytkownika ani hasła.

## Migracja wyrównująca `20261011_catchup_missing_schema`

Łańcuch 16 wcześniejszych migracji **nie odtwarzał** pełnego schematu —
po czystym przebiegu `GET /api/reservations/kregle` zwracało 500
(`column "tables_arrival_window_before_minutes" does not exist`).

Zakres ustalono przez porównanie dwóch jednorazowych baz: **A** (pusta + wszystkie
migracje) i **B** (pusta + `push` wprost z konfiguracji Payload). Porównano
kolumny z typami, nullability i defaultami, typy enum, indeksy i ograniczenia.

Wynik:

| Kategoria | Różnica |
|---|---|
| Kolumny brakujące w A | **3** — dodane migracją |
| Typy enum brakujące w A | **1** — `enum_reservations_invoice_invoice_type` |
| Indeksy | brak brakujących (A ma 4 nadmiarowe, celowo dodane naszymi migracjami) |
| Ograniczenia | brak różnic (52 = 52) |
| Kolumny nadmiarowe w A | **2** — pozostałości, świadomie zostawione |

Migracja jest **wyłącznie addytywna**: `CREATE TYPE` + trzy
`ADD COLUMN IF NOT EXISTS`. Bez `DROP`, bez zmian nazw.

### Czego ta migracja świadomie nie robi

`payload migrate:create` proponowało potraktowanie `events.show_on_homepage`
jako zmiany nazwy z `events.all_day`. To byłoby błędne — baza A zawiera **obie**
kolumny jednocześnie, więc nie jest to rename, tylko osobna, przestarzała
kolumna. Zgadywanie groziłoby utratą danych na produkcji. `events.all_day`
i `reservation_settings.tables_deposit_from_tables_count` zostają nietknięte:
są nullable, mają defaulty i nic ich nie czyta.

### Znane, nienaprawione rozbieżności atrybutów

Dotyczą kolumn, które istnieją w obu schematach, ale różnią się szczegółami.
Nie są naprawiane tutaj, bo dotykałyby istniejących danych produkcyjnych
i wymagają osobnego przeglądu:

| Kolumna | Po migracjach | Wg konfiguracji |
|---|---|---|
| `reservations.group_id` | `text` | `varchar` |
| `reservations.internal_note` | `text` | `varchar` |
| `reservations.reservation_number` | `text` | `varchar` |
| `reservations.customer_email` | `NOT NULL` | nullable |
| `reservations.payment_status` | `NOT NULL` | nullable |
| `events.kind`, `block_all_day`, `blocks_venue`, `show_on_homepage` | `NOT NULL` | nullable |
| `events.start_hour`, `start_minute` | nullable | `NOT NULL` |

`text` i `varchar` bez długości są w PostgreSQL równoważne funkcjonalnie.
Różnice `NOT NULL` oznaczają, że schemat z migracji jest miejscami **ostrzejszy**
niż konfiguracja — w szczególności `reservations.customer_email` jest `NOT NULL`,
choć pole `email` w kolekcji ma `required: false`. Rezerwacja bez e-maila
utworzona z panelu zakończy się błędem bazy. To osobne zadanie.

Kolejność wartości w enumach różni się między A i B (migracje dokładają wartości
przez `ALTER TYPE ... ADD VALUE`, push tworzy je w kolejności z konfiguracji).
Zbiory wartości są zgodne, a Payload nie opiera się na porządku enumów.

## Konfiguracja `Black-App-Staging`

### 1. Źródło

Podłącz repozytorium `primalalchemists-ui/Black` i wybierz gałąź do wdrażania.

### 2. Zmienne

Istniejące (bez zmian):

```
DATABASE_URL            = ${{Postgres.DATABASE_URL}}
PAYLOAD_SECRET          = <niezależny sekret stagingowy>
P24_ENV                 = mock
EMAIL_MODE              = mock
MAIL_TO_OWNER           = <e-mail testowy>
RESERVATION_TEST_EMAIL  = <e-mail testowy>
```

Do dodania:

```
RUN_DB_MIGRATIONS              = true
DB_ENVIRONMENT_ID              = black-staging
DB_MIGRATION_EXPECTED_HOST     = ${{Postgres.PGHOST}}
DB_MIGRATION_EXPECTED_DATABASE = ${{Postgres.PGDATABASE}}
```

Nie ma już zmiennej `DB_MIGRATION_EXPECT_EMPTY` — wymóg pustej bazy przy
pierwszym uruchomieniu jest teraz bezwarunkowy i nie wymaga konfiguracji.

Sprawdź też, czy `PAYLOAD_URL` wskazuje domenę stagingu, a nie produkcję.

### 3. Pre-deploy

Deploy → Pre-deploy Command:

```
node migrate.mjs
```

### 4. Pierwsze wdrożenie

1. Ustaw zmienne i komendę Pre-deploy.
2. Uruchom wdrożenie.
3. W logach Pre-deploy sprawdź:
   ```
   [migrate] Cel: <host>:<port>/<baza>
   [migrate] Migracji w pakiecie: 17
   [migrate] Połączenie i istnienie bazy potwierdzone.
   [migrate] Pusta baza — oznaczono jako środowisko "black-staging".
   [migrate] Uruchamiam payload.db.migrate()…
   [migrate] Zakończono pomyślnie.
   ```
4. Utwórz pierwszego użytkownika administratora przez `/admin`.
5. Uzupełnij globale `site-settings` i `reservation-settings` oraz zasoby
   (tory, stoły) — bez nich endpointy dostępności zwracają `enabled: false`.

Baza startuje pusta; migracje tworzą pełny schemat. Nie kopiujemy żadnych danych
z produkcji.

## Produkcja — nadal poza zakresem

Usunięcie migracji z builda nie zmienia niczego funkcjonalnie na produkcji, bo
ten krok i tak nie mógł działać. Po zmergowaniu do `main` produkcja nadal nie
będzie miała automatycznego mechanizmu migracji — to świadoma decyzja do
podjęcia osobno.

> ### Zanim ktokolwiek uruchomi te migracje na produkcji
>
> Wymagany jest **osobny przegląd obejmujący jednocześnie**:
>
> 1. **faktyczny schemat produkcyjny** — czy brakujące kolumny już tam są,
>    a jeśli tak, czy mają zgodny typ i default;
> 2. **zawartość `payload_migrations` na produkcji** — które migracje są tam
>    odnotowane jako wykonane.
>
> `ADD COLUMN IF NOT EXISTS` zapewnia tylko, że migracja nie wywali się na
> istniejącej kolumnie. **Nie gwarantuje**, że istniejąca kolumna ma właściwy
> typ, default czy nullability.
>
> Zapytanie weryfikacyjne (tylko odczyt):
>
> ```sql
> SELECT table_name, column_name, udt_name, is_nullable, column_default
> FROM information_schema.columns
> WHERE table_schema = 'public'
>   AND (
>     (table_name = 'reservation_settings' AND column_name LIKE 'tables_arrival_window_%')
>     OR (table_name = 'reservations' AND column_name = 'invoice_invoice_type')
>   )
> ORDER BY table_name, column_name;
> ```
>
> Oczekiwane:
>
> | Kolumna | Typ | Null | Default |
> |---|---|---|---|
> | `reservation_settings.tables_arrival_window_before_minutes` | `numeric` | YES | `120` |
> | `reservation_settings.tables_arrival_window_after_minutes` | `numeric` | YES | `0` |
> | `reservations.invoice_invoice_type` | `enum_reservations_invoice_invoice_type` | YES | brak |
>
> Jeżeli któraś kolumna istnieje, ale różni się typem lub defaultem — zatrzymaj
> się i zaplanuj osobną migrację korygującą. Nie uruchamiaj tej.
>
> Sprawdź też stan znacznika tożsamości: produkcja go nie ma, więc skrypt
> odmówi działania, dopóki nie zostanie świadomie oznaczona
> (`INSERT INTO db_environment_marker ...`) — to celowe.

## Uruchomienie migracji lokalnie

```bash
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/moja_baza \
PAYLOAD_SECRET=<dowolny> \
RUN_DB_MIGRATIONS=true \
DB_ENVIRONMENT_ID=local-dev \
DB_MIGRATION_EXPECTED_HOST=127.0.0.1 \
DB_MIGRATION_EXPECTED_DATABASE=moja_baza \
pnpm exec tsx scripts/run-migrations.ts
```

## Rozwiązywanie problemów

| Komunikat | Przyczyna |
|---|---|
| `RUN_DB_MIGRATIONS != 'true'` | Brak zgody na migracje w tym środowisku. |
| `Brak DB_ENVIRONMENT_ID` | Nie zadeklarowano identyfikatora środowiska. |
| `Ta baza jest oznaczona jako środowisko "X"` | `DATABASE_URL` wskazuje inną bazę, niż zakłada `DB_ENVIRONMENT_ID`. |
| `Baza nie ma znacznika środowiska, ale zawiera N tabel` | Celujesz w istniejącą bazę, która nigdy nie była oznaczona. Fail-closed. |
| `Baza "X" nie istnieje` | Literówka w nazwie bazy; nie zakładamy jej automatycznie. |
| `Host bazy to "X", a zadeklarowano "Y"` | Niezgodność `DATABASE_URL` z deklaracją. |
| `missing secret key` | Brak `PAYLOAD_SECRET`. |
