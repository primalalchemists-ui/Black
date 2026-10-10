# Testy integracyjne — rezerwacje i blackouty o północy

`tests/int/midnight.int.spec.ts` wywołuje **prawdziwe handlery HTTP**
(`GET`/`POST` z `route.ts`) przez **prawdziwy Payload** na **prawdziwym
PostgreSQL**. Nie odtwarza algorytmu produkcyjnego w helperach — helpery
budują tylko żądania i czytają odpowiedzi.

## Bezpieczeństwo

Suite **przerywa się z błędem**, jeśli:

- `DATABASE_URL` nie wskazuje bazy o nazwie zawierającej `black_midnight_test`,
- `PAYLOAD_DB_PUSH` nie jest ustawione na `true`.

Dzięki temu nie da się ich przypadkiem uruchomić na bazie dev ani produkcyjnej.
Nigdy nie używaj do nich poświadczeń produkcyjnych.

## Dlaczego `PAYLOAD_DB_PUSH`

Projekt ma `push: false` — schemat zmieniają wyłącznie migracje z
`src/migrations`. Na izolowanej bazie testowej schemat stawiamy jednak przez
`push`, bo **`payload migrate` nie działa na Windows + Node 24**:

```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data,
and node are supported by the default ESM loader. On Windows, absolute paths
must be valid file:// URLs. Received protocol 'c:'
```

`src/payload.config.ts` czyta `push: process.env.PAYLOAD_DB_PUSH === 'true'`,
więc **bez tej zmiennej zachowanie produkcyjne jest niezmienione** (`false`).

Na Linuksie/macOS schemat można postawić normalnie:
`DATABASE_URL=<baza testowa> pnpm payload migrate` i wtedy pominąć `PAYLOAD_DB_PUSH`.

## Uruchomienie (Windows PowerShell)

### 1. Izolowany kontener PostgreSQL

Świadomie **nie** używamy `docker compose` — ten montuje wolumen `pgdata`
z lokalną bazą dev. Stawiamy osobny kontener na osobnym porcie:

```powershell
docker run -d --name black-midnight-test-pg `
  -e POSTGRES_PASSWORD=testonly_midnight `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_DB=black_midnight_test `
  -p 55433:5432 postgres:16
```

### 2. Reset bazy przed każdym przebiegiem

Suite tworzy rezerwacje na konkretne dni, więc powtórny przebieg na brudnej
bazie zwracałby 409. Przed każdym uruchomieniem:

```powershell
docker exec black-midnight-test-pg psql -U postgres -d postgres `
  -c "DROP DATABASE IF EXISTS black_midnight_test WITH (FORCE);" `
  -c "CREATE DATABASE black_midnight_test;"
```

### 3. Testy

```powershell
$env:DATABASE_URL="postgresql://postgres:testonly_midnight@127.0.0.1:55433/black_midnight_test"
$env:PAYLOAD_DB_PUSH="true"
$env:P24_ENV="mock"
$env:NODE_OPTIONS="--no-deprecation --no-experimental-strip-types"
pnpm exec vitest run tests/int/midnight.int.spec.ts
```

Pełny suite (jednostkowe + oba pliki integracyjne) wymaga
`--no-file-parallelism`. Bez tego dwa pliki integracyjne równolegle stawiają
schemat na tej samej bazie i jeden pada na `CREATE TABLE`:

```powershell
pnpm exec vitest run --no-file-parallelism
```

Testy jednostkowe (`tests/unit`) nie potrzebują bazy ani żadnych zmiennych.

### 4. Sprzątanie

```powershell
docker rm -f black-midnight-test-pg
```

## Co pokrywają (29 testów)

| Obszar | Przypadki |
|---|---|
| Kręgle 23:00–00:00 | utworzenie, zapisane `startsAt`/`endsAt`/segment, tor zajęty o 23:00, inny tor wolny, duplikat → 409, ten sam czas na innym torze → 200 |
| Kręgle 22:00–00:00 | blokuje 22:00 **i** 23:00, nie blokuje 21:00, nakładająca się → 409, rozłączna 20:00 → 200 |
| Regresja 18:00–20:00 | blokuje tylko 18:00 i 19:00, sąsiadująca 20:00 przechodzi |
| Bilard 23:00–00:00 | blokada stołu, duplikat → 409, drugi stół wolny |
| Wielozasobowo | tory z różnymi segmentami blokowane niezależnie |
| Blackouty | 22:00–00:00 da się utworzyć i blokuje 22:00 + 23:00, POST → 409, całodniowy, zwykły dzienny 14:00–16:00, odrzucenie zero-duration, odrzucenie przejścia na następny dzień |
| Panel admina | rezerwacja 23:00–00:00 + odrzucenie kolizji, odrzucenie zero-duration |
| Płatności / anulowanie | anulowanie zwalnia slot, wygasły hold zwalnia slot, aktywny hold nadal blokuje |

## Konfiguracja seedowana przez suite

- `site-settings.openingHours`: 10:00–00:00 dla wszystkich dni.
  Bez tego działa fallback 16:00–22:00 i slot 23:00 w ogóle nie powstaje.
- `reservation-settings`: `bowling`/`billiard` włączone, `pricePerHour = 0`
  (zero kwoty → brak ścieżki P24; płatności mają własne pokrycie),
  `latestReservationStartBeforeClosingMinutes = 0`.
- Zasoby: tory 1–3, stoły 1–2 (seedowane idempotentnie).
- Dni testowe: +60 dni od teraz, aby 15-minutowy lead-time nie odrzucał żądań.
