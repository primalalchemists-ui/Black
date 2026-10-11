# Staging — ochrona dostępu i replikacja treści

Uzupełnienie [STAGING.md](./STAGING.md), które opisuje migracje. Ten dokument
dotyczy dwóch rzeczy: zamknięcia środowiska testowego przed światem oraz
wypełnienia go treścią.

---

## 1. Bramka dostępu

### Skrót

Middleware (`src/middleware.ts`) ma dwie warstwy, w tej kolejności:

1. **Bramka stagingowa** — włączana wyłącznie przez `STAGING_PROTECTION=true`.
   Obejmuje strony frontendu, panel Payload **oraz `/api/*`**.
2. **Tryb maintenance** — bez zmian względem wcześniejszej wersji, w tym
   świadome pominięcie `/api/*`.

Przy `STAGING_PROTECTION` nieustawionym bramka nie wykonuje żadnej operacji:
produkcja działa dokładnie tak jak dotąd.

### Dlaczego nie wystarczył tryb maintenance

Matcher trybu maintenance wykluczał `/api/*`, więc endpointy rezerwacji
i płatności były osiągalne również przy włączonych pracach technicznych. Dla
środowiska testowego to nie wystarcza — żądanie bez poświadczeń nie może
dotrzeć do handlera mutującego.

Dlatego matcher poszerzono o `/api/*`, a zakres trybu maintenance utrzymano
bez zmian jawnym warunkiem w `applyMaintenanceGate`:

```ts
if (pathname.startsWith("/api/")) return null
```

### Zmienne środowiskowe

| Zmienna                     | Wymagana                  | Znaczenie                                                                 |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `STAGING_PROTECTION`        | nie (domyślnie wyłączona) | `true` włącza bramkę. Każda inna wartość = wyłączona.                     |
| `STAGING_ACCESS_KEY`        | tak, gdy bramka włączona  | Klucz dostępu do środowiska. Wyłącznie w zmiennych Railway, nigdy w repo. |
| `PAYLOAD_SECRET`            | tak (już istnieje)        | Materiał do HMAC tokenu w ciasteczku.                                     |
| `STAGING_ALLOW_P24_WEBHOOK` | nie (domyślnie wyłączona) | `true` otwiera **wyłącznie** `/api/payments/p24/status`. Patrz niżej.     |

Gdy `STAGING_PROTECTION=true`, a brakuje `STAGING_ACCESS_KEY` lub
`PAYLOAD_SECRET`, cały ruch otrzymuje **503** — bramka zamyka się, zamiast
przypadkiem przepuścić żądania.

`STAGING_ACCESS_KEY` nie jest tym samym co `MAINTENANCE_PASSWORD` i nie powinien
się z nim pokrywać. Produkcja nie ma mieć żadnej z tych zmiennych ustawionej
na `STAGING_*`.

### Dwie drogi uwierzytelnienia

**Przeglądarka.** Dowolna chroniona strona zwraca 401 ze formularzem. Po
wysłaniu klucza `/api/staging/login` ustawia ciasteczko `__staging_auth`
(httpOnly, SameSite=lax, 12 h, `secure` w produkcyjnym `NODE_ENV`). Ciasteczko
zawiera HMAC-SHA256 klucza, nie sam klucz. Wylogowanie: `/api/staging/logout`.

**Playwright / narzędzia.** Nagłówek z kluczem, bez logowania:

```ts
// playwright.config.ts
use: {
  extraHTTPHeaders: {
    'x-staging-access': process.env.STAGING_ACCESS_KEY!,
  },
}
```

Obie drogi porównują HMAC, nie surowy tekst, więc długość porównywanych ciągów
nie zależy od danych wejściowych.

### Odpowiedzi

| Żądanie                               | Odpowiedź                                           |
| ------------------------------------- | --------------------------------------------------- |
| Strona bez poświadczeń                | `401` + HTML z formularzem                          |
| `/api/*` bez poświadczeń              | `401` + `{"ok":false,"error":"STAGING_UNAUTHORIZED"}` |
| Poświadczenia poprawne                | żądanie przechodzi dalej                            |
| Bramka włączona, konfiguracja niepełna | `503` dla wszystkiego                               |

API dostaje JSON, nie HTML, żeby klient oczekujący JSON-a nie dostał strony.

### Zasoby statyczne

Matcher wyklucza `/_next/*`, `/images/*` i `/favicon.ico`. Wykluczenie
`/images/*` jest konieczne: optymalizator obrazów Next pobiera lokalny plik
wewnętrznym żądaniem HTTP, które nie niesie ciasteczka — bramkowanie tej
ścieżki kończyłoby się błędem 400 w `/_next/image`.

### Fetche serwer → własne `/api/*`

Bramka obejmuje `/api/*`, a żądania wychodzące z serwera nie mają ciasteczka
przeglądarki. Cztery takie miejsca dokładają nagłówek przez
`internalFetchHeaders()` z `src/lib/stagingAccess.ts`:

- `src/lib/siteSettings.ts`
- `src/app/(frontend)/HomeClient.tsx`
- `src/app/(payload)/api/privacy-policy/route.ts`
- `src/app/(payload)/api/regulamin/route.ts`

Poza stagingiem `internalFetchHeaders()` zwraca pusty obiekt, więc nie zmienia
niczego w produkcji. Trasy PDF dokładają nagłówek **tylko** dla własnego
origin — gdy plik leży w S3, klucz nie jest wysyłany do obcego hosta:

```ts
const sameOrigin = !pdfUrl.startsWith("http")
const upstream = await fetch(absoluteUrl, sameOrigin ? { headers: internalFetchHeaders() } : undefined)
```

### Webhook P24 Sandbox — jak otworzyć bezpiecznie, gdy będzie potrzebny

Dziś nie jest potrzebny: staging działa z `P24_ENV=mock`, który nie kontaktuje
się z żadnym API Przelewy24, więc żaden webhook nie przychodzi.

Gdyby włączyć `P24_ENV=sandbox`, Przelewy24 musi móc wywołać jeden endpoint
z internetu, bez klucza stagingowego. Przewidziany sposób:

1. Ustawić `STAGING_ALLOW_P24_WEBHOOK=true`.
2. Wyjątek obejmuje **dokładnie jedną ścieżkę** — `/api/payments/p24/status`,
   porównywaną przez równość, nie przez prefiks. `/api/payments/p24/status/x`
   nie jest objęte. Żaden inny endpoint się nie otwiera.
3. Endpoint zachowuje własną ochronę: weryfikuje podpis `sha384` z CRC
   sandboxa (`verifyCallbackSign`) i bez poprawnego podpisu nic nie robi.
   Dopuszczenie go w bramce czyni go **osiągalnym**, nie bezbronnym.

Wyjątek jest domyślnie wyłączony i sterowany osobną zmienną, żeby włączenie
sandboxa było świadomą decyzją, a nie efektem ubocznym. Pokrycie testami:
`tests/unit/stagingAccess.spec.ts` sprawdza, że przy
`STAGING_ALLOW_P24_WEBHOOK=true` żaden inny endpoint nie przechodzi.

---

## 2. Replikacja treści — `scripts/seed-staging-content.ts`

### Skąd pochodzi treść

Wyłącznie z publicznego HTTP produkcji, samymi żądaniami GET. Skrypt nigdy nie
łączy się z bazą produkcyjną i nie korzysta z panelu produkcyjnego.

| Obszar                 | Źródło                                           | Replikowalne |
| ---------------------- | ------------------------------------------------ | ------------ |
| Dane obiektu, godziny  | `/api/globals/site-settings`                     | tak          |
| Kategorie menu         | `/api/menu-categories`                           | tak          |
| Pozycje menu           | `/api/menu-items`                                | tak          |
| Wydarzenia             | `/api/events`                                    | tak, bez obrazka |
| Tory i stoły           | `/api/reservations/resources?type=kregle｜bilard` | tak          |
| Cennik, limity, flagi  | `reservation-settings` — publiczne API zwraca **403** | **nie**  |
| Pliki media (PDF, obrazki) | `/api/media/file/*`                          | **nie**      |
| Treść redakcyjna stron | kod źródłowy (`src/app/(frontend)/**`)           | przez deploy |
| Zdjęcia i filmy stron  | `public/images/**` w repo (48 plików, ~37 MB)    | przez deploy |

### Czego skrypt nie dotyka

Lista zapisywalnych kolekcji jest zamknięta. Zakazane i sprawdzane asercją przy
starcie: `reservations`, `payments`, `users`, `occasional-inquiries`,
`blackouts`, `media`. Rezerwacji testowych skrypt nie tworzy — mają być
fikcyjne i generowane osobno.

### Dlaczego nie trafi w produkcję

Zapis wymaga, by w bazie **istniała** tabela `db_environment_marker` z wartością
równą `DB_ENVIRONMENT_ID`. Tabelę zakłada wyłącznie `scripts/run-migrations.ts`,
uruchamiany tylko na stagingu. Baza produkcyjna jej nie ma, a seed nigdy jej nie
tworzy — brak znacznika zatrzymuje nawet tryb `--dry-run`.

### Idempotencja i cudze zmiany

Każdy zapis jest odnotowywany w `seed_provenance` (poza modelem Payloada) wraz
z hashem treści. Przy kolejnym uruchomieniu dokument zmieniony ręcznie po
ostatnim seedzie — albo niepochodzący z seeda — jest **pomijany i raportowany**,
nie nadpisywany. Nadpisanie wymaga jawnego `--apply --force`.

Skrypt nigdy nie usuwa. Treść obecna w stagingu, a nieobecna w źródle, jest
zgłaszana przez `--validate`.

### Uruchomienie

```bash
DATABASE_URL=<baza stagingowa> \
DB_ENVIRONMENT_ID=black-staging \
pnpm exec tsx scripts/seed-staging-content.ts --dry-run    # plan, nic nie zapisuje

#   --validate   porównanie w obie strony, nic nie zapisuje
#   --apply      wykonanie planu, wymaga dodatkowo SEED_TARGET=true
#   --force      dopuszcza nadpisanie dokumentów obcego pochodzenia
```

`SEED_SOURCE_URL` domyślnie wskazuje `https://www.kregielnia-wielun.pl` i musi
być adresem HTTPS.

### Do ręcznego uzupełnienia na stagingu

1. **`reservation-settings`** — cennik kręgli i bilarda, limity miejsc, okna
   rezerwacji, flagi włączenia. Publiczne API zwraca 403, a wartości widoczne
   na stronie `/rozrywka` pochodzą z zapasowych stałych w kodzie
   (`pricePerHour ?? 50` i `?? 120`), nie z CMS — nie wolno ich traktować jako
   odczytu produkcji.
2. **Pliki media** — regulamin i polityka prywatności w PDF oraz obrazki
   wydarzeń. Wymagają wgrania przez panel stagingu i osobnego bucketa S3.
3. **`dish-of-day`** — wskazuje pozycję menu relacją; ustawiane ręcznie, żeby
   nie przenosić identyfikatorów z produkcji.

### Pole `startsAt` w wydarzeniach

`startsAt` i `endsAt` są wyliczane hookiem `beforeValidate` z `day`
+ `startHour`/`startMinute` przez `setHours`, czyli **w strefie czasowej
serwera**. Seed ich nie przenosi i nie porównuje — zapisuje składniki i pozwala
hookowi policzyć wynik w środowisku docelowym.
