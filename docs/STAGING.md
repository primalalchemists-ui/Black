# Staging na Railway — migracje bazy danych

Dotyczy projektu `Black-Staging` (serwis `Black-App-Staging` + serwis `Postgres`).

> ## ⛔ BLOKADA: łańcuch migracji nie odtwarza pełnego schematu
>
> Mechanizm opisany w tym dokumencie jest gotowy i zweryfikowany, ale
> **pierwsze wdrożenie stagingu jeszcze się nie uda.** Odtworzenie wszystkich
> 16 migracji na pustej bazie daje schemat, którego aplikacja nie akceptuje.
>
> Dowody (zweryfikowane na izolowanej bazie):
>
> - Po migracjach `/admin` odpowiada **HTTP 200**, ale
>   `GET /api/reservations/kregle` zwraca **HTTP 500**:
>   `column "tables_arrival_window_before_minutes" does not exist`.
>   Pola `arrivalWindowBeforeMinutes` i `arrivalWindowAfterMinutes` istnieją
>   w `src/globals/ReservationSettings.ts`, ale **żadna migracja ich nie tworzy**.
> - `payload migrate:create` uruchomione na zmigrowanej bazie pyta też
>   o `show_on_homepage` w tabeli `events` — czyli luka obejmuje więcej niż
>   jedną tabelę.
>
> Przyczyna: część pól trafiła do konfiguracji Payload bez wygenerowania
> migracji (prawdopodobnie przez `push` w czasie developmentu). Produkcyjna
> baza te kolumny ma, bo powstały tam poza łańcuchem migracji.
>
> ### Co trzeba zrobić przed pierwszym wdrożeniem
>
> Wygenerować i **przejrzeć** migrację wyrównującą:
>
> ```bash
> DATABASE_URL=<izolowana baza po migracjach> pnpm payload migrate:create catchup
> ```
>
> Komenda jest **interaktywna** — dla każdej różnicy pyta, czy to nowa kolumna,
> czy zmiana nazwy istniejącej. Dlatego musi ją uruchomić człowiek; nie da się
> jej sensownie zautomatyzować, a zgadywanie groziłoby utratą danych przy
> błędnym zakwalifikowaniu kolumny jako „rename".
>
> Na Windows + Node 24 `payload migrate:create` nie działa
> (`ERR_UNSUPPORTED_ESM_URL_SCHEME`) — uruchom ją w kontenerze z etapu
> `builder` albo w WSL.
>
> ### Uwaga dla produkcji
>
> Wygenerowana migracja wyrównująca **uruchomi się też na produkcji**, gdzie te
> kolumny już istnieją. Zwykłe `ADD COLUMN` wtedy wywali błąd. Przed mergem
> trzeba albo dopisać `IF NOT EXISTS`, albo zweryfikować, że produkcja faktycznie
> jest w stanie, który ta migracja zakłada. To osobna decyzja — ta gałąź jej
> nie przesądza.

## Skrót

Migracje uruchamia **komenda Pre-deploy**:

```
node migrate.mjs
```

Nie są uruchamiane w trakcie budowania obrazu i nie są uruchamiane przy starcie
aplikacji. Każdy błąd zwraca niezerowy kod wyjścia i zatrzymuje wdrożenie.

## Dlaczego nie podczas builda

W Dockerfile było wcześniej:

```dockerfile
RUN ... pnpm run migrate:deploy || true
```

Dwa problemy:

1. Sieć prywatna Railway nie jest dostępna na etapie budowania obrazu, więc
   połączenie z bazą i tak nie mogło dojść do skutku.
2. `|| true` połykało każdy błąd — build wyglądał na udany niezależnie od tego,
   czy migracje przeszły.

W praktyce migracje tą drogą nie wykonywały się wcale. Krok został usunięty.

## Dlaczego nie `payload migrate` w Pre-deploy

Pre-deploy działa w **zbudowanym obrazie**, a ten zawiera wyłącznie output
`next build --output standalone`. Sprawdzone w realnie zbudowanym obrazie:

```
$ docker run --rm --entrypoint sh <obraz> -c 'ls -1 /app/node_modules | wc -l'
6
$ docker run --rm --entrypoint sh <obraz> -c 'ls -1 /app/node_modules'
@aws-sdk
graphql
next
react
sharp
typescript
```

W obrazie nie ma pakietu `payload`, nie ma `@payloadcms/*`, nie ma `pg`
i nie ma katalogu `node_modules/.bin`. Next wkompilował te zależności
w `.next/server/chunks`. Dodatkowo `src/migrations/*.ts` nie jest w ogóle
śledzone przez tracing Next, bo `payload.config.ts` tych plików nie importuje.

CLI Payloada jest więc w runtime fizycznie niedostępne.

## Rozwiązanie: `migrate.mjs`

W etapie `builder` Dockerfile pakuje `scripts/run-migrations.ts` esbuildem
do jednego samowystarczalnego pliku `migrate.mjs`, który trafia do obrazu
obok `server.js`. Plik nie wymaga CLI Payloada, `node_modules` ani TypeScriptu.

Logika migracji **nie jest przepisywana**. Skrypt wywołuje natywne
`payload.db.migrate({ migrations })`. Adapter drizzle jawnie wspiera podanie
gotowej tablicy migracji zamiast czytania ich z dysku
(`@payloadcms/drizzle/dist/migrate.js`: `args?.migrations || readMigrationFiles(...)`),
więc tabela `payload_migrations`, transakcje i kolejność działają identycznie
jak przy `payload migrate`.

## Zabezpieczenia

Skrypt odmawia działania, dopóki operator nie zadeklaruje **jawnie**, w co celuje.
Nie opiera się na `NODE_ENV` — w obrazie produkcyjnym jest on zawsze
`production`, także na stagingu, więc nie odróżnia tych środowisk.

| Zmienna | Rola |
|---|---|
| `RUN_DB_MIGRATIONS` | Musi być dokładnie `true`. Bez tego skrypt nic nie robi i kończy się kodem 1. |
| `DB_MIGRATION_EXPECTED_HOST` | Musi zgadzać się z hostem z `DATABASE_URL`. |
| `DB_MIGRATION_EXPECTED_DATABASE` | Musi zgadzać się z nazwą bazy z `DATABASE_URL`. |
| `DB_MIGRATION_EXPECT_EMPTY` | Opcjonalna. `true` → odmawia, jeśli schemat `public` zawiera jakiekolwiek tabele. |

Dodatkowo `DATABASE_URL` jest walidowany strukturalnie: protokół, jednoznaczny
host, dokładnie jeden segment ścieżki oraz odrzucenie parametrów libpq, które
potrafią przestawić faktyczny cel połączenia (`dbname`, `host`, `hostaddr`,
`port`, `service`, `options`).

Logi pokazują wyłącznie `host:port/baza` — nigdy użytkownika ani hasła.

### Granica tych zabezpieczeń

Deklaracje hosta i nazwy bazy wyłapią **ręczne nadpisanie** `DATABASE_URL`
(np. wklejenie URL-a z innego projektu). Nie odróżnią natomiast dwóch środowisk
Railway, gdyby oba miały bazę `railway` pod `postgres.railway.internal`.

Dlatego **przy pierwszym wdrożeniu stagingu ustaw `DB_MIGRATION_EXPECT_EMPTY=true`**.
Produkcja nie jest pusta, więc pomyłkowe wycelowanie w nią zatrzyma się, zanim
cokolwiek zmieni. Po pierwszym udanym wdrożeniu usuń tę zmienną — inaczej
kolejne wdrożenia będą odrzucane.

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
DB_MIGRATION_EXPECTED_HOST     = ${{Postgres.PGHOST}}
DB_MIGRATION_EXPECTED_DATABASE = ${{Postgres.PGDATABASE}}
DB_MIGRATION_EXPECT_EMPTY      = true      # TYLKO na pierwsze wdrożenie
```

Użycie referencji `${{Postgres.*}}` jest celowe: jeśli ktoś kiedyś nadpisze
`DATABASE_URL` wartością literalną z innego środowiska, deklaracje nadal będą
wskazywać serwis stagingowy i skrypt zatrzyma wdrożenie.

Sprawdź też, czy `PAYLOAD_URL` wskazuje domenę stagingu, a nie produkcję.

### 3. Pre-deploy

W ustawieniach serwisu, sekcja Deploy → Pre-deploy Command:

```
node migrate.mjs
```

### 4. Pierwsze wdrożenie

1. Ustaw zmienne z punktu 2, łącznie z `DB_MIGRATION_EXPECT_EMPTY=true`.
2. Ustaw komendę Pre-deploy.
3. Uruchom wdrożenie.
4. W logach Pre-deploy sprawdź:
   ```
   [migrate] Cel: <host>:<port>/<baza>
   [migrate] Migracji w pakiecie: 16
   [migrate] Baza jest pusta — zgodnie z DB_MIGRATION_EXPECT_EMPTY=true.
   [migrate] Uruchamiam payload.db.migrate()…
   [migrate] Zakończono pomyślnie.
   ```
5. **Usuń `DB_MIGRATION_EXPECT_EMPTY`.**
6. Utwórz pierwszego użytkownika administratora przez `/admin`.

Baza startuje pusta — migracje tworzą pełny schemat (zweryfikowane: 16 migracji,
23 tabele w schemacie `public`). Nie kopiujemy żadnych danych z produkcji.

## Produkcja — stan bez zmian

Usunięcie kroku migracji z builda **nie zmienia niczego funkcjonalnie na
produkcji**, bo ten krok i tak nie mógł działać (brak sieci prywatnej podczas
builda, błąd połykany przez `|| true`).

Natomiast po zmergowaniu tej gałęzi do `main` produkcja nadal **nie będzie**
miała żadnego automatycznego mechanizmu migracji. Przed mergem trzeba
świadomie zdecydować:

- albo skonfigurować na produkcji analogiczny Pre-deploy `node migrate.mjs`
  z własnymi `DB_MIGRATION_EXPECTED_*` i **bez** `DB_MIGRATION_EXPECT_EMPTY`,
- albo zostawić migracje produkcyjne jako proces ręczny i to udokumentować.

To decyzja operatora — ta gałąź jej nie przesądza.

## Uruchomienie migracji lokalnie

```bash
DATABASE_URL=postgresql://user:pass@127.0.0.1:5432/moja_baza \
PAYLOAD_SECRET=<dowolny> \
RUN_DB_MIGRATIONS=true \
DB_MIGRATION_EXPECTED_HOST=127.0.0.1 \
DB_MIGRATION_EXPECTED_DATABASE=moja_baza \
pnpm exec tsx scripts/run-migrations.ts
```

## Rozwiązywanie problemów

| Komunikat | Przyczyna |
|---|---|
| `RUN_DB_MIGRATIONS != 'true'` | Brak zgody na migracje w tym środowisku. |
| `Host bazy to "X", a zadeklarowano "Y"` | `DATABASE_URL` wskazuje inne środowisko, niż deklarują zmienne. |
| `baza zawiera N tabel w schemacie public` | `DB_MIGRATION_EXPECT_EMPTY=true` na niepustej bazie — usuń tę zmienną po pierwszym wdrożeniu. |
| `missing secret key` | Brak `PAYLOAD_SECRET`. |
| `DATABASE_URL zawiera parametr "..."` | Parametr połączenia mógłby zmienić faktyczny cel — usuń go z URL-a. |
