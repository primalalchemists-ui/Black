# Raport działania systemu — stan obecny

> Audyt read-only. Data: 2026-06-06. Zakres: kod w repozytorium `centrum-spotkan-black` (Black / kregielnia-wielun.pl).
> Nie modyfikowano logiki aplikacji, nie robiono deployu, nie zmieniano bazy produkcyjnej, nie usuwano pól CMS.
> Wszystkie wnioski oparte są wyłącznie na kodzie znalezionym w repo. Tam, gdzie czegoś nie da się potwierdzić statycznie, jest adnotacja „wymaga testu runtime”.

---

## 1. Podsumowanie

Aplikacja to strona + system rezerwacji obiektu rozrywkowego (restauracja, kręgle, bilard, wydarzenia biznesowe, imprezy okolicznościowe), zbudowana na **Next.js 15 (App Router)** z **Payload CMS 3** jako backendem/panelem i **PostgreSQL** jako bazą. Hosting: **Railway** (Dockerfile, tryb `standalone`). Pliki (PDF, media) na **S3 (Supabase)**, e-maile przez **Resend**.

Główne moduły:
- **Treści strony** (CMS): menu restauracji, danie dnia, wydarzenia, ustawienia strony, media.
- **Rezerwacje**: stoliki, kręgle, bilard, zapisy na wydarzenia biznesowe — publiczne endpointy API + walidacja serwerowa + blokady kolizji.
- **Panel obsługi** (Payload admin): zarządzanie rezerwacjami, zasobami (tory/stoły), blokadami dostępności, ustawieniami, użytkownikami (role admin/staff).
- **Płatności online (P24)**: **zaszkicowane, ale niewdrożone** — patrz sekcja 8.

**Status gotowości produkcyjnej:**
- Część rezerwacyjno-contentowa: **działa produkcyjnie** (aplikacja jest wdrożona na Railway).
- Płatności online: **NIE są gotowe** — pliki integracji P24 są puste (0 bajtów), brak realnego tworzenia płatności i obsługi webhooka.
- Build/CI lokalnie: **kruche** — build zależy od monkey-patcha (`scripts/patch-css-minimizer.cjs`), a tryb developerski jest zablokowany przez dryf schematu bazy (kolumna `privacy_policy_pdf_id`).

---

## 2. Architektura aplikacji

**Główne technologie** (`package.json`):
- Next.js `15.4.10`, React `19.2.1`.
- Payload CMS `3.69.0` + `@payloadcms/db-postgres`, `@payloadcms/next`, `@payloadcms/storage-s3`, `@payloadcms/richtext-lexical`.
- Walidacja: `zod`. Formularze: `react-hook-form` + `@hookform/resolvers`.
- E-mail: `resend`. (W kodzie są też zakomentowane pozostałości po `nodemailer` — `src/lib/mail.ts`.)
- UI: Tailwind + Radix + komponenty własne (`src/components/ui`).

**Frontend** — `src/app/(frontend)/`:
- Strony: `page.tsx` (home), `restauracja/`, `rozrywka/`, `imprezy/`, `biznes/`, `dofinansowanie/`, `rezerwacje/` (z podstronami `stoliki`, `kregle`, `bilard`, `biznes`).
- Layout: `src/app/(frontend)/layout.tsx` (Header/Footer, metadane, favicon).
- Strony rezerwacji to komponenty klienckie (`Client.tsx`) pobierające dane przez `fetch` z `/api/...`.

**Backend / API** — `src/app/(payload)/`:
- Panel admin: `src/app/(payload)/admin/[[...segments]]/`.
- REST/GraphQL Payload: `api/[...slug]/route.ts`, `api/graphql`, `api/graphql-playground`.
- Własne endpointy: `api/reservations/{stoliki,kregle,bilard,biznes,availability,resources}`, `api/resources/count`, `api/inquiries/occasional`, `api/cms/events`, `api/privacy-policy`, `api/regulamin`, `api/p24/{create,webhook}`.
- Brak server actions — logika serwerowa jest w route handlerach (REST).

**Payload CMS** — `src/payload.config.ts`:
- Kolekcje: `Users, Media, Events, MenuCategories, MenuItems, Resources, Reservations, OccasionalInquiries, Payments, Blackouts`.
- Globale: `SiteSettings, DishOfDay, ReservationSettings`.
- Edytor: Lexical. Typy generowane do `src/payload-types.ts`.

**Połączenie z bazą** — `src/payload.config.ts`:
- `postgresAdapter({ pool: { connectionString: process.env.DATABASE_URL } })`.
- Brak jawnego `migrationDir` — używany jest domyślny katalog `src/migrations` (migracje są tam i podpięte w `src/migrations/index.ts`).
- S3 włączane warunkowo, gdy ustawione są wszystkie zmienne `S3_*` (inaczej uploady nie działają — `console.warn`).

**Deploy na Railway (prawdopodobny przebieg)** — `Dockerfile`:
- Multi-stage: `deps` → `builder` → `runner` (Node 22 alpine, Next `standalone`).
- Instalacja zależności wykrywa menedżer po lockfile (`pnpm i --frozen-lockfile` dla `pnpm-lock.yaml`); `COPY scripts/ ./scripts/` zapewnia działanie `postinstall`.
- Build: `pnpm run build`. Runtime: `node server.js`.
- `docker-compose.yml` to środowisko lokalne (Postgres 16 + app), nieużywane na Railway.

**Komendy build/start** (`package.json`):
- `build`: `cross-env NODE_OPTIONS="--no-deprecation --max-old-space-size=8000" next build`.
- `start`: `pnpm run migrate:deploy && cross-env NODE_OPTIONS=--no-deprecation next start` — **migracje są aplikowane przy starcie** (`payload migrate --yes`).
- `postinstall`: `node scripts/patch-css-minimizer.cjs` (obejście crasha cssnano — patrz sekcja 10).

---

## 3. Aktualny przepływ użytkownika

1. **Wejście na stronę** — strona główna (`src/app/(frontend)/page.tsx` → `HomePageClient`), sekcje: hero, oferta, wydarzenia, galeria, kontakt, info o miejscu. Dane miejsca z globala `site-settings` (`src/lib/siteSettings.ts`).
2. **Przeglądanie menu** — `restauracja/Client.tsx` pobiera:
   - `GET /api/menu-categories?where[active][equals]=true&limit=1000&sort=order`,
   - `GET /api/menu-items?where[active][equals]=true&depth=2&limit=1000&sort=order`,
   - `GET /api/globals/dish-of-day?depth=3`.
   Renderuje kategorie, pozycje (z opisem, ceną, promocją) i „danie dnia”.
3. **Rezerwacja** — użytkownik wybiera typ na `rezerwacje/page.tsx`, potem podstrona:
   - **Stoliki** (`rezerwacje/stoliki`): wybór dnia, godziny (co 15 min), liczby osób → `POST /api/reservations/stoliki`.
   - **Kręgle/Bilard** (`rezerwacje/kregle`, `rezerwacje/bilard`): siatka torów/stołów (`ResourceGrid`), wybór segmentów godzinowych → `POST /api/reservations/kregle|bilard` z `segments[]`.
   - **Biznes** (`rezerwacje/biznes`): zapis na wydarzenie → `POST /api/reservations/biznes`.
   Dostępność na żywo z `GET /api/reservations/{kregle|bilard|stoliki|availability}`.
4. **Formularze** — walidacja po stronie klienta (`zod` + `react-hook-form`) i ponownie po stronie serwera (`src/lib/validation/reservations.ts`). Pola: dane klienta, faktura (NIP), akceptacja regulaminu i polityki prywatności.
5. **Potwierdzenia** — po sukcesie front pokazuje krok „Gotowe!”. Jeśli serwer zwróci `redirectUrl`, front przekierowuje (przygotowane pod płatność — dziś nieaktywne, `rezerwacje/kregle/Client.tsx:194`).
6. **Maile/powiadomienia**:
   - Rezerwacje **stoliki/kręgle/bilard**: **brak maili** (endpointy nie wysyłają powiadomień).
   - Rezerwacja **biznes**: wysyłane 2 maile przez Resend (do właściciela i do klienta) — best-effort, błąd maila nie blokuje rezerwacji (`api/reservations/biznes/route.ts:388`).
   - **Zapytania okolicznościowe** (`api/inquiries/occasional`): wysyłają maile, ale **nie zapisują rekordu** do kolekcji `occasional-inquiries` (zapis jest tylko w komentarzu) — wymaga uwagi.
7. **Po stronie CMS** — rezerwacja jest tworzona jako rekord w kolekcji `reservations` (status `new`, `source: online`). Hooki kolekcji wyliczają `startsAt/endsAt` i blokują kolizje/przeszłość.

---

## 4. Aktualny przepływ administratora / obsługi

**Logowanie do Payload** — kolekcja `users` z `auth: true` (`src/collections/Users.ts`). Dwie role: `admin`, `staff` (domyślnie `staff`).

**Kolekcje widoczne w panelu** (grupowane przez `admin.group`):
- *Rezerwacje*: `reservations`, `resources`, `payments`, `blackouts`.
- *Treści strony*: `events`, `media`.
- *Restauracja*: `menu-categories`, `menu-items`.
- *Imprezy okolicznościowe*: `occasional-inquiries`.
- *Użytkownicy*: `users`.
- Globale: ustawienia strony, danie dnia, ustawienia rezerwacji.

**Operacje admina** (rola `admin`): pełnia uprawnień — w szczególności `delete` na większości kolekcji oraz zarządzanie użytkownikami (`users` create/update/delete tylko admin).

**Operacje obsługi** (rola `staff`): tworzenie/edycja rezerwacji, zasobów, blokad, treści menu, wydarzeń, ustawień; **bez** usuwania (delete zwykle `role === 'admin'`) i bez zarządzania użytkownikami.

**Zmiana statusu rezerwacji**: tak — pole `status` (`new/confirmed/cancelled/no_show/completed`) edytowalne przez staff/admin (`reservations.access.update = isStaffOrAdmin`). Podobnie `paymentStatus`.

**Ocena ról i access control:**
- Model ról jest spójny i wystarczający dla obecnej funkcjonalności (oddzielenie admin/staff, publiczny odczyt treści, zamknięty odczyt rezerwacji/płatności).
- **Uwaga bezpieczeństwa**: `reservations.create` i `payments.create` mają `access: () => true` (publiczne). Dla rezerwacji jest to konieczne (formularz online), ale dla `payments` create powinien tworzyć wyłącznie zaufany backend (patrz sekcje 8–9).

---

## 5. Analiza kolekcji Payload CMS

### `users` — `src/collections/Users.ts`
- **Do czego**: konta obsługi/administracji (auth do panelu).
- **Pola**: `role` (admin/staff) + pola auth (email/hasło z `auth: true`).
- **Relacje**: brak.
- **Frontend**: nieużywana publicznie; tylko panel + kontrola dostępu w API (`req.user?.role`).

### `media` — `src/collections/Media.ts`
- **Do czego**: pliki (zdjęcia, PDF) — `upload: true`, składowane na S3.
- **Pola**: `alt` (wymagane).
- **Relacje**: docelowo S3; referencjonowana przez `events.image`, `menu-items.image`, `reservation-settings.regulationsPdf/privacyPolicyPdf`.
- **Frontend**: pośrednio (PDF regulaminu/polityki przez `api/regulamin`, `api/privacy-policy`).

### `events` — `src/collections/Events.ts`
- **Do czego**: wydarzenia (promo/biznes/impreza/sport), w tym biletowane (zapisy biznes).
- **Pola**: `title, description, kind, pricePLN, status, day/allDay/startHour.., startsAt/endsAt, image, capacity, registrationsEnabled, published`.
- **Relacje**: `image → media`; `reservations.event → events`.
- **Frontend**: tak — listy/sliderzy wydarzeń (`src/lib/cms/events.ts`, `api/cms/events`), oraz zapis biznes (`pricePLN`, `capacity`, `registrationsEnabled` używane w `api/reservations/biznes`).

### `menu-categories` — `src/collections/MenuCategories.ts`
- **Do czego**: kategorie menu.
- **Pola**: `name, order, active`.
- **Relacje**: `menu-items.category → menu-categories`.
- **Frontend**: tak — `restauracja/Client.tsx:168`.

### `menu-items` — `src/collections/MenuItems.ts`
- **Do czego**: pozycje menu z ceną i promocją.
- **Pola**: `name, description, image, category, price, promo{enabled,promoPrice,startsAt,endsAt}, order, active`.
- **Relacje**: `category → menu-categories`; `image → media`; `dish-of-day.item → menu-items`.
- **Frontend**: tak — `restauracja/Client.tsx` (poza `image`, patrz sekcja 6).

### `resources` — `src/collections/Resources.ts`
- **Do czego**: tory kręgli (`lane`) i stoły bilardowe (`billiard`).
- **Pola**: `type, number, label, active, notes` (+ unikalny indeks `type+number`).
- **Relacje**: `reservations.resources`, `blackouts.resources`.
- **Frontend**: tak — `api/reservations/{resources,kregle,bilard,availability}`, `api/resources/count`.

### `reservations` — `src/collections/Reservations.ts`
- **Do czego**: rezerwacje wszystkich typów (stolik/kregle/bilard/biznes).
- **Pola (kluczowe)**: `type, customer{...}, notes, day/allDay/start..end.., startsAt/endsAt, partySize, tablesCount, resources, event, disabledPerson, disabilityDetails, invoice{wantInvoice,nip}, acceptRules, source, status, depositRequired, depositAmount, paymentStatus, paymentProvider, payment`.
- **Relacje**: `resources → resources`, `event → events`, `payment → payments`.
- **Frontend**: tak — tworzone przez endpointy rezerwacji; odczyt tylko staff/admin.
- **Hooki**: `beforeValidate` (wyliczanie `startsAt/endsAt`, `tablesCount`), `beforeChange` (blokada kolizji torów/stołów + blokada przeszłości).

### `payments` — `src/collections/Payments.ts`
- **Do czego**: rekordy płatności (P24).
- **Pola**: `provider, status, amount, currency, p24SessionId, p24OrderId, p24Sign, reservation, raw(json)`.
- **Relacje**: `reservation → reservations`; hook `afterChange` synchronizuje `paymentStatus/paymentProvider/payment` na rezerwacji.
- **Frontend/API**: **infrastruktura gotowa, ale dziś nieużywana** — żaden kod nie tworzy rekordu `payments` (pliki P24 puste).

### `blackouts` — `src/collections/Blackouts.ts`
- **Do czego**: blokady dostępności torów/stołów (serwis bowling/billiard).
- **Pola**: `title, service, day/allDay/start..end.., resources, reason, active`.
- **Relacje**: `resources → resources`.
- **Frontend**: pośrednio — uwzględniane w dostępności (`api/reservations/*`).

### `occasional-inquiries` — `src/collections/OccasionalInquiries.ts`
- **Do czego**: zapytania o imprezy okolicznościowe (komunia/stypa/urodziny/inne).
- **Pola**: `type, date/allDay/start..end.., startsAt/endsAt, people, name, phone, email, notes, status, payment{paid,depositAmount,totalAmount}`.
- **Relacje**: brak.
- **Frontend/API**: **rozłączone** — publiczny formularz (`api/inquiries/occasional`) tylko **wysyła maile**, **nie tworzy** rekordu w tej kolekcji. Kolekcja służy dziś do ręcznego prowadzenia w panelu.

### Globale
- `site-settings` (`src/globals/SiteSettings.ts`): dane kontaktowe + `openingHours` (JSON) — **kluczowe dla rezerwacji** (godziny otwarcia). Odczyt publiczny.
- `reservation-settings` (`src/globals/ReservationSettings.ts`): konfiguracja stolików/bilardu/kręgli (ceny, okna, limity) + PDF regulaminu/polityki. Odczyt tylko staff/admin.
- `dish-of-day` (`src/globals/DishOfDay.ts`): danie dnia — używane na froncie restauracji.

---

## 6. Pola CMS nieużywane przez interfejs

Analiza pól vs. kod frontendu/API. „UŻYWANE” = realnie czytane w UI/API/mailach/logice; „NIEUŻYWANE” = obecne w CMS, nigdzie nie odczytywane; „NIEJASNE” = nie da się potwierdzić statycznie / używane warunkowo.

> Pól NIE usuwano — to wyłącznie raport.

| Kolekcja | Pole w CMS | Typ pola | Używane przez frontend/API? | Gdzie używane | Uwagi |
|---|---|---|---|---|---|
| menu-categories | name | text | UŻYWANE | restauracja/Client.tsx | tytuł kategorii |
| menu-categories | order | number | UŻYWANE | restauracja/Client.tsx (sort) | |
| menu-categories | active | checkbox | UŻYWANE | filtr `where[active]` | |
| menu-items | name | text | UŻYWANE | restauracja/Client.tsx | |
| menu-items | description | textarea | UŻYWANE | restauracja/Client.tsx | |
| menu-items | image | upload→media | **NIEUŻYWANE** | — (brak renderu) | front nie wyświetla zdjęć pozycji |
| menu-items | category | relationship | UŻYWANE | grupowanie w UI | |
| menu-items | price | number | UŻYWANE | restauracja/Client.tsx | |
| menu-items | promo.enabled/promoPrice/startsAt/endsAt | group | UŻYWANE | restauracja/Client.tsx (isPromoActive) | |
| menu-items | order | number | UŻYWANE | sort | |
| menu-items | active | checkbox | UŻYWANE | filtr | |
| media | alt | text | UŻYWANE | renderowanie obrazów (gdzie używane) | |
| dish-of-day | item/customTitle/customDescription/validUntil | mix | UŻYWANE | restauracja/Client.tsx | |
| events | title/description/status/day/start../startsAt/endsAt | mix | UŻYWANE | lib/cms/events, sloty wydarzeń | |
| events | kind | select | NIEJASNE | filtrowanie list | wymaga testu runtime (które listy filtrują po kind) |
| events | pricePLN | number | UŻYWANE | api/reservations/biznes | kwota zapisywana w rezerwacji |
| events | capacity | number | UŻYWANE | api/reservations/biznes (dekrement) | |
| events | registrationsEnabled / published | checkbox | UŻYWANE | api/reservations/biznes, front | |
| events | image | upload | NIEJASNE | sliderzy/karty wydarzeń | wymaga testu runtime |
| resources | type/number/label/active | mix | UŻYWANE | api/reservations/* | |
| resources | notes | textarea | **NIEUŻYWANE** | — (tylko panel) | notatka wewnętrzna |
| reservations | type/customer/notes/day/start../startsAt/endsAt | mix | UŻYWANE | endpointy + hooki | |
| reservations | partySize/tablesCount | number | UŻYWANE | stoliki (pojemność) | |
| reservations | resources | relationship | UŻYWANE | kręgle/bilard | |
| reservations | event/disabledPerson/disabilityDetails | mix | UŻYWANE | biznes + mail | |
| reservations | invoice.wantInvoice/nip | group | UŻYWANE | zapis + mail biznes | |
| reservations | acceptRules | checkbox | UŻYWANE | wymagane | dodatkowo front wymaga `acceptPrivacyPolicy`, którego **brak jako pola w kolekcji** (patrz Uwagi poniżej) |
| reservations | source/status | select | UŻYWANE | logika + panel | |
| reservations | depositRequired/depositAmount | mix | UŻYWANE (zapis) | endpointy ustawiają | dziś tylko zapis, brak realnego poboru |
| reservations | paymentStatus/paymentProvider | select | UŻYWANE (zapis) | endpointy + Payments hook | |
| reservations | payment | relationship | NIEJASNE | Payments.afterChange | puste do czasu wdrożenia P24 |
| reservation-settings | tables.enabled/disabledMessage/availableTablesCount/arrivalWindow*/...Opening/...Closing | mix | UŻYWANE | api/reservations/stoliki | |
| reservation-settings | tables.depositAmount | number | **NIEUŻYWANE** | — | stoliki ustawiają `paymentStatus: not_required`, zaliczka z CMS nieczytana |
| reservation-settings | tables.depositFromTablesCount | number | **NIEUŻYWANE** | — | jw. |
| reservation-settings | billiard.* / bowling.* (enabled, pricePerHour, okna) | mix | UŻYWANE | api/reservations/{bilard,kregle,availability} | |
| reservation-settings | regulationsPdf | upload | UŻYWANE | api/regulamin | |
| reservation-settings | privacyPolicyPdf | upload | UŻYWANE | api/privacy-policy | |
| site-settings | name | text | UŻYWANE | lib/siteSettings, footer | |
| site-settings | slogan/description/phone/email/address/facebook/instagram | mix | NIEJASNE | footer/kontakt | część używana w stopce — wymaga testu runtime co do każdego pola |
| site-settings | openingHours | json | UŻYWANE | api/reservations/* (godziny) | |
| occasional-inquiries | wszystkie pola | mix | NIEJASNE | tylko panel | publiczny formularz **nie zapisuje** do tej kolekcji (tylko mail) |
| payments | wszystkie pola | mix | NIEUŻYWANE (dziś) | — | gotowe pod P24, brak kodu tworzącego rekord |
| users | role | select | UŻYWANE | access control | |
| blackouts | reason | textarea | **NIEUŻYWANE** | — (tylko panel) | |

**Dodatkowe uwagi z analizy pól (istotne):**
- **`reservations.acceptPrivacyPolicy`** — front i schema walidacji (`acceptDocumentsSchema`) wymagają zgody na politykę prywatności, ale **kolekcja `reservations` nie ma takiego pola** (jest tylko `acceptRules`). Zgoda nie jest więc utrwalana w rezerwacji. Wymaga decyzji (dodać pole vs. świadomie pominąć).
- **`reservations.groupId`** — endpointy kręgli/bilardu zapisują `groupId` przy wielu segmentach (`api/reservations/kregle/route.ts:466`), ale **w kolekcji `reservations` nie ma pola `groupId`** → Payload odrzuca nieznane pole, grupowanie segmentów **nie jest utrwalane**. Patrz ryzyka (sekcja 11).

---

## 7. Analiza rezerwacji

**Jak są tworzone** — publiczne `POST`:
- `api/reservations/stoliki/route.ts` — pojedyncza rezerwacja stolika.
- `api/reservations/kregle/route.ts`, `.../bilard/route.ts` — tryb `segments[]` (wiele torów/stołów na różne godziny) lub stary tryb pojedynczy.
- `api/reservations/biznes/route.ts` — zapis na wydarzenie (kwota i limit z `events`).

**Wymagane dane** (`src/lib/validation/reservations.ts`): imię, nazwisko, telefon (PL: 9 cyfr lub +48), e-mail (wymagany), `acceptRules` + `acceptPrivacyPolicy` (oba muszą być `true`), faktura warunkowo (NIP 10 cyfr). Dla siatki: `date`, `startHour`, `endHour`, `resources`, `totalPrice`. Dla stolika: `date`, `hour` (co 15 min), `partySize`.

**Walidacja** — dwustopniowa: klient (zod) + serwer (zod `safeParse`). Dodatkowo serwer sprawdza: godziny otwarcia (`site-settings.openingHours`), włączenie usługi, przeszłość, blokady (`blackouts`), kolizje/zajętość zasobów. Stoliki: pojemność w „rolling window” na podstawie `availableTablesCount` i `tablesCount`.

**Statusy rezerwacji**: `new, confirmed, cancelled, no_show, completed`. Statusy `cancelled/no_show` są ignorowane przy liczeniu dostępności.

**Ochrona przed podwójną rezerwacją tego samego terminu**:
- Kręgle/bilard: tak — sprawdzanie kolizji w endpointach **oraz** w hooku `beforeChange` kolekcji (`Reservations.ts`), działa również w panelu.
- **Uwaga**: kontrola opiera się na odczycie istniejących rezerwacji i tworzeniu nowych w osobnych zapytaniach — **brak transakcyjnej blokady/locka**, więc przy równoczesnych żądaniach możliwy jest wyścig (race condition). Wymaga testu runtime/obciążeniowego.
- Stoliki: kontrola pojemności (liczba stolików), nie kolizja konkretnego stołu.
- Biznes: limit miejsc atomowo, przez bezpośrednie `UPDATE ... WHERE capacity > 0` na puli Postgres (`api/reservations/biznes/route.ts:250`) — to jedyne miejsce z atomowym dekrementem.

**Limity miejsc/torów/stołów**: tory/stoły z kolekcji `resources` (+ unikalny indeks `type+number`); stoliki z `reservation-settings.tables.availableTablesCount`; wydarzenia z `events.capacity`.

**Czy rezerwacja ma cenę**:
- Kręgle/bilard: tak. **Nowy flow `segments[]` liczy cenę serwerowo** z `reservation-settings.*.pricePerHour × liczba godzin` (`amountToPay` po stronie serwera) — bezpieczne.
- **Stary flow (bez `segments`)**: `const amountToPay = data.totalPrice ?? 0` — **ufa wartości z klienta** (`kregle/route.ts:574`, `bilard/route.ts:574`).
- Stoliki: brak ceny w backendzie — zawsze `paymentStatus: not_required` (zaliczka z CMS nieczytana).
- Biznes: cena z `events.pricePLN` (serwerowo) — bezpieczne.

**Czy cena liczona po froncie czy backendzie**: w nowym flow kręgli/bilardu i w biznesie — **backend**. W starym flow kręgli/bilardu — front (przekazywane `totalPrice`).

**Czy użytkownik może manipulować ceną/requestem**:
- W nowym flow (segments) — **nie**, cena przeliczana serwerowo.
- W starym flow — **tak**, `totalPrice` z klienta trafia do `depositAmount`. Dziś bez konsekwencji finansowych (brak realnego poboru), ale **krytyczne przed wdrożeniem płatności**.
- `status`, `source`, `paymentStatus` ustawiane sztywno przez serwer przy tworzeniu (`status: new`, `source: online`) — klient ich nie nadpisze, bo serwer i tak podaje własne wartości w `payload.create`.

**Maile potwierdzające**: tylko dla rezerwacji **biznes** (i osobno dla zapytań okolicznościowych). Stoliki/kręgle/bilard — brak maili.

**Czy admin/obsługa może zmienić status**: tak — `status` i `paymentStatus` edytowalne przez staff/admin w panelu.

---

## 8. Gotowość pod płatności online (Przelewy24)

**Stan faktyczny**: integracja P24 jest **wyłącznie zaszkicowana**:
- `src/app/(payload)/api/p24/create/route.ts` — **pusty plik (0 bajtów)**.
- `src/app/(payload)/api/p24/webhook/route.ts` — **pusty plik (0 bajtów)**.
- Brak jakiegokolwiek kodu odwołującego się do sekretów P24 (`merchantId/posId/CRC/apiKey`) — potwierdzone grepem.
- Front jest przygotowany na przekierowanie (`if (data.redirectUrl) window.location.href = ...`), ale serwer nigdy nie zwraca `redirectUrl`.

| Kryterium | Stan | Gdzie / uwagi |
|---|---|---|
| Model rezerwacji nadaje się pod płatności | **CZĘŚCIOWO** | rezerwacja ma `depositRequired/depositAmount/paymentStatus/paymentProvider/payment`; brak utrwalonego `groupId` dla płatności łączonych |
| Miejsce na status płatności | **TAK** | `reservations.paymentStatus`, `payments.status` |
| Miejsce na ID transakcji/operatora | **TAK** | `payments.p24SessionId/p24OrderId/p24Sign`, `payments.provider` |
| Rozdzielenie statusu rezerwacji od płatności | **TAK** | `reservations.status` vs `reservations.paymentStatus` |
| Bezpieczny backend endpoint do tworzenia płatności | **NIE** | `api/p24/create` pusty |
| Płatność nie tworzona wyłącznie z danych frontu | **NIE GWARANTOWANE** | brak endpointu; stary flow kręgli/bilardu ufa `totalPrice` z klienta |
| Cena liczona/weryfikowana po stronie serwera | **CZĘŚCIOWO** | segments + biznes: tak; stary flow: nie |
| Obsługa webhook/notification URL | **NIE** | `api/p24/webhook` pusty |
| Obsługa return URL | **NIE** | brak (front obsłuży `redirectUrl`, ale go nie dostaje) |
| Logi/debug płatności | **CZĘŚCIOWO** | `payments.raw (json)` jest gotowe na surowe dane; brak loggera |
| Ochrona przed duplikatami transakcji | **NIE** | brak idempotencji; brak utrwalonego `groupId` |
| Bezpieczne testy w sandbox | **NIE (jeszcze)** | brak kodu i zmiennych środowiskowych P24 |

**Wniosek sekcji**: schemat danych (kolekcje `payments` + pola w `reservations`) jest **dobrym fundamentem**, ale sama integracja P24 (tworzenie transakcji, webhook, weryfikacja podpisu, return URL, idempotencja) **nie istnieje** i musi zostać napisana od zera.

---

## 9. Bezpieczeństwo przed wdrożeniem płatności

- **Sekrety w repo**: nie znaleziono. `.env` jest w `.gitignore`; `test.env` (śledzony) zawiera tylko `NODE_OPTIONS`; `.env.example` zawiera jedynie `DATABASE_URL` i `PAYLOAD_SECRET`. **Nie znaleziono żadnego hardcodowanego klucza/sekretu w kodzie.**
- **`.env.example` niekompletny**: brakuje udokumentowania zmiennych faktycznie używanych w kodzie: `S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, PAYLOAD_URL, RESEND_API_KEY, MAIL_FROM_NAME, MAIL_FROM_EMAIL, MAIL_TO_OWNER` oraz (docelowo) zmiennych P24. Utrudnia to poprawny deploy/onboarding.
- **Walidacja endpointów**: rezerwacje i zapytania mają walidację `zod`. Endpointy `GET` dostępności walidują parametry. OK.
- **Role i uprawnienia w Payload**: zdefiniowane i sensowne (sekcja 4).
- **Czy użytkownik z frontu może edytować dane, których nie powinien**: `reservations.update/read` zamknięte (staff/admin). Tworzenie publiczne, ale serwer nadpisuje `status/source`. **Ryzyko**: `payments.create = () => true` — publiczne tworzenie płatności powinno być zablokowane lub objęte weryfikacją (po wdrożeniu P24).
- **Czy można podmienić cenę/datę/status/ID**:
  - Cena: **tak w starym flow** kręgli/bilardu (`totalPrice` z klienta) — do naprawy przed płatnościami.
  - Data/godzina: walidowane (przeszłość, godziny otwarcia, kolizje).
  - Status/ID rezerwacji: serwer ustala status; ID generuje baza.
- **Brak autoryzacji na endpointach**: publiczne endpointy są celowo publiczne (formularze). Po wdrożeniu P24 **webhook musi być uwierzytelniony podpisem**, a nie samym faktem wywołania.
- **Webhook płatności — weryfikacja podpisu**: **wymagana, dziś nie istnieje** (plik pusty). Bez weryfikacji `sign` P24 webhook byłby podatny na podrobienie statusu „opłacone”.
- **Ryzyko działania na bazie produkcyjnej**: realne. Aplikacja w trybie nie-produkcyjnym (dev/test) wykonuje **automatyczny push schematu** (Payload/drizzle `pushDevSchema`), który próbuje `ALTER TABLE reservation_settings ... privacy_policy_pdf_id` na bazie z `DATABASE_URL`. Jeśli `DATABASE_URL` wskazuje produkcję, każdy lokalny `dev`/`test` **próbuje modyfikować produkcyjny schemat** (w trakcie audytu ta operacja themewykonała się i **zakończyła błędem cast → brak zmiany**, ale to jasno pokazuje ryzyko). Zalecane: osobna baza dev/test, nigdy produkcyjny `DATABASE_URL` lokalnie.
- **Deployment Railway — wymagane zmienne**: do działania potrzeba m.in. `DATABASE_URL`, `PAYLOAD_SECRET`, `PAYLOAD_URL`, `S3_*`, `RESEND_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_TO_OWNER` (+ docelowo P24). Wymaga weryfikacji w panelu Railway (poza zakresem statycznym).

> Zgodnie z poleceniem: nie ujawniono żadnych wartości sekretów. Nie znaleziono sekretów w kodzie.

---

## 10. Railway / deployment

- **`package.json`**: `build` = `next build` (z `--max-old-space-size=8000`); `start` = `migrate:deploy && next start`; `postinstall` = patch cssnano.
- **Build command**: `pnpm run build` (Dockerfile wykrywa pnpm po `pnpm-lock.yaml`).
- **Start command**: `node server.js` (Next standalone) — uwaga: Dockerfile uruchamia `server.js` bezpośrednio, **z pominięciem skryptu `start`**, więc **`migrate:deploy` z `package.json` nie wykona się automatycznie w obrazie Docker**. Jeśli Railway buduje z tego Dockerfile, migracje trzeba uruchamiać osobno (release command) — **wymaga weryfikacji konfiguracji Railway**.
- **Pliki infrastruktury**: jest `Dockerfile` i `docker-compose.yml` (lokalny). **Brak `railway.json`, `Procfile`, `nixpacks.toml`** w repo — sposób uruchomienia na Railway zależy od ustawień projektu (Docker vs Nixpacks) — wymaga weryfikacji.
- **Zależności wymagane do builda**: `sharp` (przetwarzanie obrazów), Tailwind/PostCSS; `onlyBuiltDependencies` w `package.json` (`sharp, esbuild, unrs-resolver`).
- **Czy projekt powinien przejść deploy w obecnym stanie**: prawdopodobnie tak na czystym środowisku Railway (clean install → `postinstall` aplikuje patch cssnano → build), bo aplikacja jest wdrożona. **Jednak build jest kruchy** (patrz niżej).
- **Potencjalne problemy z buildem produkcyjnym**:
  - **Build zależy od monkey-patcha Next** (`scripts/patch-css-minimizer.cjs`) wyłączającego minifikację CSS z powodu crasha `cssnano` na `hsl(var(--x)/alpha)` z Tailwinda. Jeśli patch się nie zaaplikuje (zmiana wersji Next, inny przebieg instalacji), **build pada** — co potwierdziło się lokalnie w tym audycie (patrz sekcja „Wyniki komend”).
  - `next.config.mjs` ma `typescript.ignoreBuildErrors: true` i `eslint.ignoreDuringBuilds: true` — build nie chroni przed błędami typów/lintu (świadoma decyzja, ale ukrywa regresje).
- **Miejsca zależne od lokalnych ścieżek/plików**: `PAYLOAD_URL` z fallbackiem `http://localhost:3000` (`api/privacy-policy/route.ts:36`, `api/regulamin/route.ts:42`, `lib/siteSettings.ts:22`) — w produkcji musi być ustawione, inaczej PDF/proxy będą pobierane z localhost.

---

## 11. Lista ryzyk

| Ryzyko | Poziom | Gdzie w kodzie | Dlaczego ważne | Rekomendacja |
|---|---|---|---|---|
| Cena z klienta w starym flow rezerwacji | **wysoki** | `api/reservations/kregle/route.ts:574`, `.../bilard/route.ts:574` (`amountToPay = data.totalPrice`) | Po wdrożeniu P24 klient mógłby zapłacić zaniżoną kwotę | Liczyć kwotę wyłącznie serwerowo; usunąć zaufanie do `totalPrice` |
| Brak weryfikacji podpisu webhooka P24 | **wysoki** (po wdrożeniu) | `api/p24/webhook/route.ts` (pusty) | Podrobienie statusu „opłacone” | Weryfikować `sign`/CRC P24 i kwotę przed oznaczeniem `paid` |
| `payments.create` publiczne | **wysoki** (po wdrożeniu) | `src/collections/Payments.ts:31` | Możliwość tworzenia/manipulacji rekordów płatności z zewnątrz | Ograniczyć `create` do backendu (`overrideAccess`) / zablokować publicznie |
| Lokalny dev/test pushuje schemat na bazę z `DATABASE_URL` | **wysoki** | Payload/drizzle `pushDevSchema` (poza repo), `payload.config.ts` | Ryzyko modyfikacji produkcyjnego schematu | Oddzielna baza dev/test; nigdy prod `DATABASE_URL` lokalnie; rozważyć wyłączenie dev-push |
| Build zależny od monkey-patcha cssnano | **średni** | `scripts/patch-css-minimizer.cjs`, `package.json` (`postinstall`) | Build pada, gdy patch się nie zaaplikuje (potwierdzone lokalnie) | Docelowo: poprawne źródło CSS lub konfiguracja minifikacji zamiast patcha; pin wersji Next |
| `groupId` zapisywany, brak pola w kolekcji | **średni** | `api/reservations/{kregle,bilard}/route.ts` vs `Reservations.ts` | Płatności łączone i grupowanie segmentów nie są utrwalane; utrudnia idempotencję płatności | Dodać pole `groupId` do `reservations` |
| `acceptPrivacyPolicy` nieutrwalany | **średni** (RODO) | walidacja wymaga, `Reservations.ts` nie ma pola | Brak dowodu zgody na politykę prywatności | Dodać pole zgody do kolekcji |
| Brak transakcyjnej blokady przy rezerwacji torów | **średni** | `api/reservations/{kregle,bilard}` + hook `beforeChange` | Wyścig przy równoczesnych żądaniach (podwójna rezerwacja) | Lock/transakcja lub unikalny constraint na (resource, przedział) |
| Migracje mogą nie odpalać się w obrazie Docker | **średni** | `Dockerfile` (`CMD node server.js`) vs `package.json start` | Schemat prod może rozjechać się z modelem | Dodać release/migrate step na Railway lub uruchamiać `start` |
| Publiczny formularz okolicznościowy nie zapisuje danych | **niski/średni** | `api/inquiries/occasional/route.ts` | Zapytania istnieją tylko w mailu; brak rejestru | Zapisywać do `occasional-inquiries` |
| `.env.example` niekompletny | **niski** | `.env.example` | Ryzyko błędnego deployu (brak S3/Resend/PAYLOAD_URL) | Uzupełnić o wszystkie wymagane zmienne (bez wartości) |
| `PAYLOAD_URL` fallback na localhost | **niski** | `api/privacy-policy`, `api/regulamin`, `lib/siteSettings.ts` | PDF/proxy z localhost w razie braku zmiennej | Wymusić ustawienie `PAYLOAD_URL` w produkcji |
| Build ignoruje błędy TS i ESLint | **niski** | `next.config.mjs` | Ukrywa regresje typów/lintu | Włączyć przynajmniej w CI |
| Brak maili dla rezerwacji stoliki/kręgle/bilard | **niski** (UX) | endpointy rezerwacji | Klient nie dostaje potwierdzenia | Dodać maile potwierdzające |

---

## 12. Rekomendowany plan wdrożenia płatności

### Etap 1 — przygotowanie modelu danych
- Dodać pole `reservations.groupId` (string, indeks) i zapisywać je realnie dla płatności łączonych.
- Dodać `reservations.acceptPrivacyPolicy` (checkbox) i utrwalać zgodę.
- Ujednolicić cenę: **wyłącznie serwerowo** dla wszystkich typów; usunąć zaufanie do `totalPrice` z klienta (stary flow).
- Zdecydować o stolikach: czy mają zaliczkę (`tables.depositAmount`/`depositFromTablesCount` są dziś nieużywane) i wpiąć logikę serwerową.
- Zamknąć `payments.create` dla świata zewnętrznego (tworzenie tylko przez backend z `overrideAccess`).

### Etap 2 — integracja sandbox Przelewy24
- Dodać zmienne ENV: `P24_MERCHANT_ID`, `P24_POS_ID`, `P24_CRC`, `P24_API_KEY`, `P24_SANDBOX=true`, `P24_RETURN_URL`, `P24_STATUS_URL` (nazewnictwo do ustalenia) — udokumentować w `.env.example` (bez wartości).
- Zaimplementować `api/p24/create`:
  - przyjmuje `reservationId`/`groupId`, **pobiera kwotę z bazy** (nie z requestu),
  - rejestruje transakcję w P24 (`/transaction/register`), zapisuje rekord `payments` (`pending`, `p24SessionId`, `amount`, `raw`),
  - zwraca `redirectUrl` do bramki (front już to obsługuje).
- Idempotencja: jeden aktywny `payments(pending)` na rezerwację/`groupId`.

### Etap 3 — webhook/notification
- Zaimplementować `api/p24/webhook`:
  - **weryfikacja podpisu** (`sign`/CRC) i zgodności kwoty/sesji,
  - `verify` transakcji w P24 (`/transaction/verify`),
  - aktualizacja `payments.status = paid|failed` → hook `Payments.afterChange` zsynchronizuje `reservations.paymentStatus`,
  - pełna idempotencja (powtórne notyfikacje nie zmieniają stanu).
- Skonfigurować return URL (strona „dziękujemy/sprawdzamy płatność”).

### Etap 4 — testy end-to-end
- Sandbox: udana płatność, przerwana, błędna kwota, podwójne kliknięcie (idempotencja), powtórzony webhook, webhook z błędnym podpisem (musi odrzucić), test mobile.
- Weryfikacja synchronizacji statusów rezerwacja↔płatność.

### Etap 5 — produkcja
- Przełączenie na klucze produkcyjne P24 (ENV w Railway), `P24_SANDBOX=false`.
- Konfiguracja produkcyjnego `notification URL` w panelu P24 (publiczny adres webhooka).
- Upewnić się, że migracje są aplikowane na produkcji (release step / `start`).

### Etap 6 — monitoring i procedura obsługi błędów
- Logowanie zdarzeń płatności (wykorzystać `payments.raw`) + alerty na błędy webhooka.
- Procedura ręcznej weryfikacji w panelu P24 i ręcznego oznaczania statusu.
- Polityka wygasania nieopłaconych rezerwacji (np. zwolnienie terminu po N minutach `pending`).

---

## 13. Checklist przed uruchomieniem płatności

- [ ] konto Przelewy24 sandbox
- [ ] merchant ID / pos ID / CRC / klucze w ENV
- [ ] endpoint tworzenia płatności po stronie serwera (`api/p24/create`)
- [ ] walidacja ceny po stronie serwera (wszystkie typy; usunięty `totalPrice` z klienta)
- [ ] payment status w CMS (`reservations.paymentStatus` — gotowe)
- [ ] transaction/session ID w CMS (`payments.p24SessionId/p24OrderId` — gotowe)
- [ ] webhook notification URL (`api/p24/webhook`)
- [ ] weryfikacja podpisu webhooka
- [ ] return URL
- [ ] test udanej płatności
- [ ] test przerwanej płatności
- [ ] test podwójnego kliknięcia (idempotencja)
- [ ] test błędnej kwoty
- [ ] test mobile
- [ ] test produkcyjnego builda na Railway (z aplikowanym patchem cssnano i migracjami)

---

## 14. Wnioski końcowe

**Czy system jest gotowy pod płatności: CZĘŚCIOWO.**

- **Fundament danych jest dobry**: kolekcja `payments`, pola `paymentStatus/paymentProvider/depositAmount/payment` w `reservations`, rozdzielenie statusu rezerwacji od statusu płatności, hook synchronizujący — wszystko to istnieje i jest poprawnie zaprojektowane.
- **Sama integracja P24 nie istnieje**: pliki `api/p24/create` i `api/p24/webhook` są **puste (0 bajtów)**, nie ma rejestracji transakcji, weryfikacji podpisu ani obsługi return/notification URL.

**Co jest blokujące (przed włączeniem płatności):**
1. Implementacja `api/p24/create` z kwotą liczoną serwerowo.
2. Implementacja `api/p24/webhook` z weryfikacją podpisu i idempotencją.
3. Usunięcie zaufania do `totalPrice` z klienta w starym flow kręgli/bilardu (`*/route.ts:574`).
4. Zamknięcie publicznego `payments.create`.
5. Pewność, że migracje są aplikowane na produkcji (przepływ Docker `CMD node server.js` pomija `migrate:deploy`).

**Co jest zalecane (równolegle):**
- Dodać pola `groupId` i `acceptPrivacyPolicy` do `reservations`.
- Uzupełnić `.env.example` o wszystkie wymagane zmienne.
- Oddzielić bazę dev/test od produkcyjnej (ryzyko dev-push).
- Ustabilizować build (zależność od patcha cssnano).

**Co można zrobić później:**
- Maile potwierdzające dla stolików/kręgli/bilardu.
- Zapis publicznych zapytań okolicznościowych do kolekcji.
- Blokada transakcyjna przeciw wyścigom przy rezerwacji torów.
- Polityka wygasania nieopłaconych rezerwacji.

---

## Załącznik A — wyniki uruchomionych komend (środowisko audytu)

> Środowisko lokalne Windows; `pnpm` uruchamiany przez `corepack`. Wyniki obrazują stan repo „as-is”.

**`pnpm lint`** — **FAIL (exit 1)**.
Przyczyna środowiskowa, nie kod: `Cannot find package '@eslint/eslintrc' imported from eslint.config.mjs` oraz ostrzeżenie „Found multiple lockfiles” (corepack wybrał `C:\Users\48728\package-lock.json` zamiast projektowego `pnpm-lock.yaml`). Do weryfikacji na czystym środowisku CI.

**`pnpm test:int` (vitest)** — **FAIL (exit 1)**.
Jest 1 test (`tests/int/api.int.spec.ts` → „fetches users”) i jest **pominięty (skipped)**. Suite pada w `beforeAll` na `getPayload()` → `pushDevSchema` → `ALTER TABLE "reservation_settings" ALTER COLUMN "privacy_policy_pdf_id" SET DATA TYPE integer` → `column ... cannot be cast automatically to type integer`. To ten sam dryf schematu co blokuje tryb dev. (Operacja zakończona błędem — bez zmiany w bazie.)

**`pnpm build`** — **FAIL (exit 1)**.
Błąd w minifikacji CSS: `HookWebpackError: Cannot read properties of undefined (reading 'length')` w `cssnano-simple` (plik CSS Tailwinda). To dokładnie crash, który ma neutralizować `scripts/patch-css-minimizer.cjs` (uruchamiany w `postinstall`). W tym środowisku patch nie został zaaplikowany do `node_modules` (najpewniej z powodu anomalii instalacji / wielu lockfile'ów), więc `cssnano` był aktywny i build padł. Na czystym deployu Railway (clean install → `postinstall` → build) ten patch zwykle działa — **wymaga potwierdzenia na czystym buildzie**.

**`pnpm test:e2e` (Playwright)** — **nie uruchamiano** (wymaga przeglądarek/serwera; poza zakresem statycznego audytu).

---

## Załącznik B — kluczowe pliki przeczytane podczas audytu

- Konfiguracja: `src/payload.config.ts`, `next.config.mjs`, `package.json`, `Dockerfile`, `docker-compose.yml`, `tsconfig.json`, `.env.example`, `test.env` (tylko nazwy kluczy).
- Kolekcje: `src/collections/{Users,Media,Events,MenuCategories,MenuItems,Resources,Reservations,Payments,Blackouts,OccasionalInquiries}.ts`.
- Globale: `src/globals/{SiteSettings,ReservationSettings,DishOfDay}.ts`.
- API rezerwacji: `src/app/(payload)/api/reservations/{stoliki,kregle,bilard,biznes,availability,resources}/route.ts`, `_shared.ts`, `_openingHours.ts`.
- API płatności: `src/app/(payload)/api/p24/{create,webhook}/route.ts` (puste).
- API pozostałe: `src/app/(payload)/api/{resources/count,inquiries/occasional,privacy-policy,regulamin}/route.ts`.
- Walidacja/logika: `src/lib/validation/reservations.ts`, `src/components/reservations/money.ts`, `src/lib/mail.ts`, `src/lib/siteSettings.ts`, `src/lib/resourceFilters.ts` (pośrednio).
- Frontend: `src/app/(frontend)/layout.tsx`, `src/app/(frontend)/restauracja/Client.tsx`, `src/app/(frontend)/rezerwacje/kregle/Client.tsx`.
- Migracje: `src/migrations/index.ts`, `src/migrations/20260528_fix_privacy_policy_pdf_column.ts`.
