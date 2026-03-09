export const metadata = {
  title: "Dofinansowanie",
  description: "Informacje o projekcie dofinansowanym z Funduszy Europejskich.",
}

export default function DofinansowaniePage() {
  return (
    <section className="w-full bg-background">
      <div className="mx-auto  px-4 py-12 md:px-0">
        <div className="mx-auto py-2 px-8">
          <h1 className="mb-8 text-3xl font-bold tracking-tight md:text-4xl">
            Dofinansowanie
          </h1>

          <div className="space-y-8 text-base leading-7 text-foreground">
            <p>
              <strong>
                Prywatne przedsiębiorstwo handlowo usługowe „Andrea” Andrzej
                Kamiński, ośrodek „Zacisze”
              </strong>{" "}
              realizuje projekt pn.{" "}
              <strong>
                „Dywersyfikacja oferty usługowej w regionie łódzkim poprzez
                realizację projektu”
              </strong>
              , w ramach Krajowego Planu Odbudowy i Zwiększania Odporności,
              Działanie A1.2.1 – Inwestycje dla przedsiębiorstw w produkty,
              usługi i kompetencje pracowników oraz kadry związane z
              dywersyfikacją działalności.
            </p>

            <div>
              <h2 className="mb-4 text-2xl font-semibold">
                Główne działania obejmują
              </h2>
              <ol className="list-decimal space-y-3 pl-6">
                <li>
                  Inwestycje w środki trwałe – zakup wyposażenia
                  gastronomicznego, mebli ogrodowych, umeblowania, sprzętu
                  audio.
                </li>
                <li>
                  Cyfryzację – wdrożenie nowej zakładki wraz z możliwością
                  rezerwacji online.
                </li>
                <li>
                  Szkolenia personelu – Wnioskodawca zostanie przeszkolony w
                  zakresie rozwoju kompetencji cyfrowych oraz technicznych.
                </li>
                <li>
                  Doradztwo w zakresie Gospodarki Obiegu Zamkniętego (GOZ) –
                  przeprowadzenie audytu i wdrożenie strategii ograniczania
                  odpadów, co przyczyni się do zrównoważonego rozwoju
                  działalności.
                </li>
                <li>
                  Zieloną transformację – wdrożenie zaleceń GOZ oraz systemu
                  filtracji wody.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="mb-4 text-2xl font-semibold">Cele projektu</h2>
              <p>
                Dywersyfikacja działalności firmy poprzez wprowadzenie oferty
                dla klienta biznesowego. Nowe usługi zwiększą konkurencyjność
                przedsiębiorstwa, przyczyniając się do wzrostu przychodów oraz
                ograniczenia negatywnego wpływu na środowisko dzięki promocji
                systemu filtracji wody.
              </p>
            </div>

            <div>
              <h2 className="mb-4 text-2xl font-semibold">Grupy docelowe</h2>
              <p>
                Nowa oferta skierowana jest do klientów biznesowych chcących
                organizować konferencje czy szkolenia.
              </p>
            </div>

            <div>
              <h2 className="mb-4 text-2xl font-semibold">Efekty projektu</h2>
              <ol className="list-decimal space-y-3 pl-6">
                <li>
                  Nowa oferta usługowa – oferta dla klienta biznesowego
                  (organizacja spotkań biznesowych, konferencji czy szkoleń).
                </li>
                <li>
                  Podniesienie kompetencji personelu – szkolenia w zakresie
                  umiejętności cyfrowych oraz technicznych.
                </li>
                <li>
                  Transformacja cyfrowa – wdrożenie nowoczesnego oprogramowania
                  do zarządzania rezerwacjami.
                </li>
                <li>
                  Zielona transformacja – ograniczenie zużycia butelek
                  plastikowych poprzez zastosowanie systemu filtracji wody i
                  wdrożenie zasad GOZ.
                </li>
                <li>
                  Wzrost odporności rynkowej firmy – dywersyfikacja działalności
                  i zwiększenie stabilności przychodów.
                </li>
              </ol>
            </div>

            <div className="space-y-3 rounded-2xl border bg-muted/30 p-6">
              <p className="text-lg">
                <strong>Wartość projektu:</strong> 581 000,00 PLN
              </p>
              <p className="text-lg">
                <strong>Wysokość wkładu Funduszy Europejskich:</strong> 464
                741,90 PLN
              </p>
            </div>

            <div className="flex flex-wrap gap-3 pt-2 text-sm font-medium text-muted-foreground">
              <span>#KorzyściDlaCiebie</span>
              <span>#NextGenerationEU</span>
              <span>#FunduszeUE</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}