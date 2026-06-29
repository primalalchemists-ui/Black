import { Download } from "lucide-react"
import { getPayload } from "payload"
import config from "@payload-config"

export const metadata = {
  title: "Regulamin | Centrum Spotkań Black",
  description: "Regulamin Centrum Rozrywkowego Black — restauracja, kręgle, bilard, wydarzenia biznesowe.",
}

export default async function RegulaminPage() {
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({
    slug: "reservation-settings",
    depth: 0,
    overrideAccess: true,
  })

  const hasPdf = Boolean(settings?.regulationsPdf)

  return (
    <div className="px-4 pb-12 mt-8">
      <div className="mx-auto max-w-full">

        {/* Nagłówek */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--brand))]">
              Centrum Rozrywkowe Black
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Regulamin obiektu</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Restauracja · Kręgle · Bilard · Wydarzenia biznesowe
            </p>
          </div>
          {hasPdf && (
            <a
              href="/api/regulamin"
              download="regulamin.pdf"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[hsl(var(--brand))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--brand))] transition-colors hover:bg-[hsl(var(--brand-soft))]"
            >
              <Download className="h-4 w-4" />
              Pobierz PDF
            </a>
          )}
        </div>

        {/* Dane przedsiębiorcy */}
        <div className="mb-6 rounded-xl border bg-muted/40 px-5 py-4 text-sm">
          <p className="font-semibold text-foreground">P.P.H.U. „ANDREA" ANDRZEJ KAMIŃSKI</p>
          <p className="text-muted-foreground">Ośrodek „Zacisze" · Centrum Rozrywkowe „BLACK"</p>
          <div className="mt-2 space-y-0.5 text-muted-foreground">
            <p>Sieradzka 28A, 98-300 Wieluń</p>
            <p>NIP: 8321002917</p>
            <p>Tel: 691 246 975</p>
            <p>
              E-mail:{" "}
              <a href="mailto:blackplatnosci@gmail.com" className="underline hover:text-foreground">
                blackplatnosci@gmail.com
              </a>
            </p>
          </div>
        </div>

        {/* Treść regulaminu */}
        <div className="space-y-8 rounded-2xl border bg-card px-6 py-8 text-sm leading-relaxed md:px-10">

          <Section title="I. Postanowienia ogólne">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Regulamin określa zasady korzystania z Obiektu Black obejmującego restaurację, kręgielnię, bilard oraz wydarzenia biznesowe.</li>
              <li>Każda osoba przebywająca na terenie Obiektu zobowiązana jest do zapoznania się z Regulaminem i jego przestrzegania.</li>
              <li>Skorzystanie z usług Obiektu jest równoznaczne z akceptacją niniejszego Regulaminu.</li>
            </ol>
          </Section>

          <Section title="II. Rezerwacje – zasady ogólne">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>
                Rezerwacje przyjmowane są wyłącznie:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>telefonicznie,</li>
                  <li>osobiście na miejscu,</li>
                  <li>poprzez formularz rezerwacji dostępny na stronie internetowej Obiektu.</li>
                </ol>
              </li>
              <li>Rezerwacje nie są przyjmowane drogą mailową.</li>
              <li>Rezerwacje możliwe są maksymalnie na 7 dni do przodu.</li>
              <li>
                Przy dokonywaniu rezerwacji wymagane jest podanie:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>imienia i nazwiska lub nazwy firmy,</li>
                  <li>numeru telefonu,</li>
                  <li>adresu e-mail (w przypadku rezerwacji online).</li>
                </ol>
              </li>
            </ol>
          </Section>

          <Section title="III. Restauracja – rezerwacja stolików">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Rezerwacja stolików w restauracji nie jest ograniczona do pełnych godzin.</li>
              <li>Jeden stolik przeznaczony jest maksymalnie dla 16 osób.</li>
              <li>W przypadku organizacji spotkań grupowych istnieje możliwość rezerwacji sali dla maksymalnie 50 osób. Szczegóły rezerwacji oraz ewentualne warunki dodatkowe ustalane są indywidualnie z Obsługą Obiektu.</li>
              <li>W przypadku rezerwacji większej liczby stolików lub rezerwacji grupowych Obiekt może wymagać wpłaty zaliczki.</li>
              <li>Wysokość zaliczki oraz informacja o jej obowiązku każdorazowo prezentowane są w procesie rezerwacji na stronie internetowej Obiektu.</li>
              <li>Zaliczka za rezerwację stolików jest zwracana w przypadku pojawienia się Gości w Obiekcie.</li>
              <li>W przypadku niepojawienia się Gości w ustalonym terminie zaliczka może zostać zatrzymana.</li>
            </ol>
          </Section>

          <Section title="IV. Kręgle – zasady rezerwacji i gry">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Rezerwacje kręgli przyjmowane są wyłącznie na pełne godziny.</li>
              <li>Kręgle są płatne z góry zgodnie z ceną wskazaną w systemie rezerwacyjnym.</li>
              <li>Na jednym torze może przebywać maksymalnie 8 osób.</li>
              <li>Tor zostaje automatycznie wyłączony po upływie opłaconego czasu gry.</li>
              <li>Opłaconą rezerwację można przenieść na inny termin jednorazowo, z zachowaniem minimum 24 godzin wyprzedzenia, o ile dostępność na to pozwala.</li>
            </ol>
          </Section>

          <Section title="V. Bilard – zasady rezerwacji">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Rezerwacje bilarda przyjmowane są wyłącznie na pełne godziny.</li>
              <li>Bilard jest płatny z góry zgodnie z ceną wskazaną w systemie rezerwacyjnym.</li>
              <li>Przy jednym stole bilardowym może jednocześnie przebywać maksymalnie 4 osoby.</li>
            </ol>
          </Section>

          <Section title="VI. Niepojawienie się na rezerwacji (no-show)">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>W przypadku rezerwacji kręgli lub bilarda Klient zobowiązany jest do stawienia się na czas przed rozpoczęciem zarezerwowanego czasu, o ile nie uzgodniono inaczej z obsługą.</li>
              <li>Brak obecności Klienta 15 minut przed rozpoczęciem rezerwacji, bez wcześniejszego kontaktu z Obiektem, może skutkować anulowaniem rezerwacji przez obsługę.</li>
              <li>
                W przypadku anulowania rezerwacji z powodu niepojawienia się Klienta:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>wniesiona opłata nie podlega zwrotowi,</li>
                  <li>Obiekt ma prawo udostępnić zwolniony termin innym Klientom.</li>
                </ol>
              </li>
              <li>Późniejsze zgłoszenie się Klienta po anulowaniu rezerwacji nie obliguje Obiektu do realizacji pierwotnej rezerwacji ani do zwrotu środków.</li>
            </ol>
          </Section>

          <Section title="VII. Wydarzenia biznesowe">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Zapisy na wydarzenia biznesowe odbywają się poprzez formularz rezerwacji lub telefonicznie.</li>
              <li>Płatność za wydarzenia biznesowe odbywa się na miejscu, o ile nie ustalono inaczej.</li>
              <li>Limit miejsc oraz szczegóły organizacyjne zależą od charakteru wydarzenia.</li>
              <li>Organizator wydarzenia ponosi odpowiedzialność za uczestników.</li>
            </ol>
          </Section>

          <Section title="VIII. Zwroty i odstąpienie od umowy">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Z uwagi na charakter usług polegających na rezerwacji na określoną datę i godzinę Klientowi nie przysługuje prawo odstąpienia od umowy, o którym mowa w art. 27 ustawy o prawach konsumenta.</li>
              <li>Opłaty wniesione z góry za rezerwację kręgli lub bilarda są bezzwrotne, z zastrzeżeniem indywidualnych ustaleń z Obiektem.</li>
            </ol>
          </Section>

          <Section title="IX. Zasady porządkowe i bezpieczeństwo">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Na terenie Obiektu dozwolone jest spożywanie alkoholu zakupionego w restauracji.</li>
              <li>
                Zabrania się:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>wnoszenia własnych napojów i żywności,</li>
                  <li>wnoszenia niebezpiecznych przedmiotów,</li>
                  <li>palenia wyrobów tytoniowych i e-papierosów,</li>
                  <li>przebywania osób w stanie znacznej nietrzeźwości.</li>
                </ol>
              </li>
              <li>Obsługa ma prawo odmówić dalszego świadczenia usług osobom naruszającym Regulamin.</li>
            </ol>
          </Section>

          <Section title="X. Odpowiedzialność">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Obiekt nie ponosi odpowiedzialności za rzeczy pozostawione na jego terenie.</li>
              <li>Za zniszczenia wyposażenia odpowiada sprawca w wysokości 100% wartości mienia.</li>
              <li>Teren Obiektu jest monitorowany.</li>
            </ol>
          </Section>

          <Section title="XI. Postanowienia końcowe">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>W sprawach nieuregulowanych Regulaminem decyzję podejmuje właściciel Obiektu lub osoba upoważniona.</li>
              <li>Właściciel Obiektu zastrzega sobie prawo do interpretacji Regulaminu.</li>
              <li>Regulamin obowiązuje od dnia jego zatwierdzenia.</li>
            </ol>
          </Section>

          <Section title="XII. Reklamacje">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Klient ma prawo złożyć reklamację dotyczącą świadczonych usług.</li>
              <li>
                Reklamację można złożyć:
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>
                    drogą elektroniczną na adres:{" "}
                    <a href="mailto:blackplatnosci@gmail.com" className="underline hover:text-foreground">
                      blackplatnosci@gmail.com
                    </a>,
                  </li>
                  <li>pisemnie na adres siedziby przedsiębiorcy.</li>
                </ul>
              </li>
              <li>
                Reklamacja powinna zawierać:
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>imię i nazwisko Klienta,</li>
                  <li>dane kontaktowe,</li>
                  <li>opis zgłaszanego problemu.</li>
                </ul>
              </li>
              <li>Reklamacje rozpatrywane są w terminie 14 dni kalendarzowych od dnia ich otrzymania.</li>
              <li>O sposobie rozpatrzenia reklamacji Klient zostanie poinformowany drogą elektroniczną lub telefonicznie.</li>
            </ol>
          </Section>

        </div>

        {/* Pobierz PDF — dół */}
        {hasPdf && (
          <div className="mt-6 flex justify-center">
            <a
              href="/api/regulamin"
              download="regulamin.pdf"
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--brand))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--brand))] transition-colors hover:bg-[hsl(var(--brand-soft))]"
            >
              <Download className="h-4 w-4" />
              Pobierz regulamin PDF
            </a>
          </div>
        )}

      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-[hsl(var(--brand))]">{title}</h2>
      {children}
    </section>
  )
}
