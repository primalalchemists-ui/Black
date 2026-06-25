import { Download } from "lucide-react"
import { getPayload } from "payload"
import config from "@payload-config"

export const metadata = {
  title: "Polityka prywatności | Centrum Spotkań Black",
  description: "Polityka prywatności serwisu kregielnia-wielun.pl — zasady przetwarzania danych osobowych.",
}

export default async function PolitykaPrywatnosciPage() {
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({
    slug: "reservation-settings",
    depth: 0,
    overrideAccess: true,
  })

  const hasPdf = Boolean(settings?.privacyPolicyPdf)

  return (
    <div className="px-4 pb-12 mt-10">
      <div className="mx-auto max-w-full">

        {/* Nagłówek */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--brand))]">
              Centrum Rozrywkowe Black
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Polityka prywatności</h1>
            <p className="mt-1 text-sm text-muted-foreground">kregielnia-wielun.pl</p>
          </div>
          {hasPdf && (
            <a
              href="/api/privacy-policy"
              download="polityka-prywatnosci.pdf"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[hsl(var(--brand))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--brand))] transition-colors hover:bg-[hsl(var(--brand-soft))]"
            >
              <Download className="h-4 w-4" />
              Pobierz PDF
            </a>
          )}
        </div>

        {/* Treść */}
        <div className="space-y-8 rounded-2xl border bg-card px-6 py-8 text-sm leading-relaxed md:px-10">

          <Section title="I. Postanowienia ogólne">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>
                Niniejsza Polityka prywatności określa zasady przetwarzania danych osobowych Użytkowników
                korzystających z serwisu internetowego{" "}
                <span className="font-medium">https://www.kregielnia-wielun.pl/</span>.
              </li>
              <li>
                Dane osobowe przetwarzane są zgodnie z:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 (RODO),</li>
                  <li>ustawą z dnia 10 maja 2018 r. o ochronie danych osobowych.</li>
                </ol>
              </li>
              <li>
                Serwis nie prowadzi sprzedaży kont użytkowników, nie wymaga rejestracji oraz nie
                wykorzystuje plików cookies w celach marketingowych ani analitycznych.
              </li>
            </ol>
          </Section>

          <Section title="II. Administrator danych">
            <p className="mb-3 text-foreground/80">Administratorem danych osobowych jest:</p>
            <div className="rounded-xl border bg-muted/40 px-5 py-4 text-sm">
              <p className="font-semibold text-foreground">P.P.H.U. „ANDREA" ANDRZEJ KAMIŃSKI</p>
              <p className="text-muted-foreground">CENTRUM ROZRYWKOWE „BLACK"</p>
              <div className="mt-2 space-y-0.5 text-muted-foreground">
                <p>Sieradzka 28A, 98-300 Wieluń</p>
                <p>
                  E-mail:{" "}
                  <a href="mailto:blackplatnosci@gmail.com" className="underline hover:text-foreground">
                    blackplatnosci@gmail.com
                  </a>
                </p>
                <p>Tel: 691 246 975</p>
              </div>
            </div>
            <p className="mt-3 text-foreground/80">Administrator nie powołał Inspektora Ochrony Danych.</p>
          </Section>

          <Section title="III. Zakres przetwarzanych danych">
            <p className="mb-2 text-foreground/80">
              Administrator przetwarza wyłącznie dane osobowe podane dobrowolnie przez Użytkownika,
              w szczególności:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-foreground/80">
              <li>imię i nazwisko,</li>
              <li>numer telefonu,</li>
              <li>adres e-mail,</li>
              <li>treść wiadomości lub uwagi dotyczące rezerwacji,</li>
              <li>dane dotyczące rezerwacji,</li>
              <li>numer NIP wyłącznie w przypadku zgłoszenia chęci otrzymania faktury.</li>
            </ul>
          </Section>

          <Section title="IV. Cele i podstawa prawna przetwarzania">
            <p className="mb-2 text-foreground/80">Dane osobowe przetwarzane są w celu:</p>
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>
                Przyjmowania i realizacji rezerwacji:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>stolików,</li>
                  <li>stołów bilardowych,</li>
                  <li>torów do kręgli.</li>
                </ol>
              </li>
              <li>Obsługi zapisów na wydarzenia biznesowe.</li>
              <li>Kontaktu z Użytkownikiem.</li>
              <li>Realizacji płatności lub zaliczek.</li>
              <li>Wystawienia faktury.</li>
            </ol>
            <p className="mt-3 mb-1 text-foreground/80">Podstawą prawną przetwarzania danych jest:</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground/80">
              <li>art. 6 ust. 1 lit. b RODO,</li>
              <li>art. 6 ust. 1 lit. f RODO.</li>
            </ul>
          </Section>

          <Section title="V. Okres przechowywania danych">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>
                Dane osobowe przechowywane są przez okres niezbędny do:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>realizacji rezerwacji,</li>
                  <li>organizacji wydarzenia,</li>
                  <li>obsługi płatności, reklamacji lub roszczeń.</li>
                </ol>
              </li>
              <li>Po upływie tego okresu dane mogą zostać usunięte lub zanonimizowane.</li>
            </ol>
          </Section>

          <Section title="VI. Odbiorcy danych">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>
                Dane mogą być przekazywane:
                <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
                  <li>dostawcom hostingu i infrastruktury IT,</li>
                  <li>dostawcom poczty elektronicznej,</li>
                  <li>operatorom płatności,</li>
                  <li>podmiotom świadczącym usługi księgowe.</li>
                </ol>
              </li>
              <li>Dane nie są przekazywane poza Europejski Obszar Gospodarczy.</li>
            </ol>
          </Section>

          <Section title="VII. Prawa osób, których dane dotyczą">
            <p className="mb-2 text-foreground/80">Użytkownik ma prawo do:</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground/80">
              <li>dostępu do danych,</li>
              <li>sprostowania danych,</li>
              <li>usunięcia danych,</li>
              <li>ograniczenia przetwarzania,</li>
              <li>wniesienia sprzeciwu.</li>
            </ul>
            <p className="mt-3 text-foreground/80">
              Kontakt:{" "}
              <a href="mailto:blackplatnosci@gmail.com" className="underline hover:text-foreground">
                blackplatnosci@gmail.com
              </a>
            </p>
            <p className="mt-2 text-foreground/80">
              Użytkownik ma również prawo wniesienia skargi do Prezesa UODO.
            </p>
          </Section>

          <Section title="VIII. Pliki cookies">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Serwis nie wykorzystuje plików cookies w celach marketingowych ani analitycznych.</li>
              <li>Mogą być stosowane wyłącznie cookies techniczne niezbędne do działania Serwisu.</li>
            </ol>
          </Section>

          <Section title="IX. Zautomatyzowane podejmowanie decyzji">
            <p className="text-foreground/80">
              Dane osobowe nie są przetwarzane w sposób zautomatyzowany ani nie podlegają profilowaniu.
            </p>
          </Section>

          <Section title="X. Postanowienia końcowe">
            <ol className="list-decimal space-y-2 pl-5 text-foreground/80">
              <li>Administrator zastrzega sobie prawo do wprowadzania zmian w Polityce prywatności.</li>
              <li>Aktualna wersja dokumentu jest zawsze dostępna w Serwisie.</li>
              <li>W sprawach nieuregulowanych zastosowanie mają przepisy RODO oraz prawa polskiego.</li>
            </ol>
          </Section>

        </div>

        {/* Pobierz PDF — dół */}
        {hasPdf && (
          <div className="mt-6 flex justify-center">
            <a
              href="/api/privacy-policy"
              download="polityka-prywatnosci.pdf"
              className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--brand))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--brand))] transition-colors hover:bg-[hsl(var(--brand-soft))]"
            >
              <Download className="h-4 w-4" />
              Pobierz politykę prywatności PDF
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
