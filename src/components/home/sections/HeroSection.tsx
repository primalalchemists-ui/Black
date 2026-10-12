"use client"

import * as React from "react"
import Link from "next/link"
import type { CarouselApi } from "@/components/ui/carousel"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import DotNav from "@/components/home/components/DotNav"
import { useReducedMotion } from "framer-motion"
import { useImageLoaded } from "@/lib/useImageLoaded"

const HERO_SLIDES = [
  {
    desktopSrc: "/images/desktop/slider-1.webp",
    mobileSrc: "/images/mobile/slider-1.webp",
    alt: "Centrum Spotkań Black — wnętrze i klimat miejsca",
  },
  // {
  //   desktopSrc: "/images/desktop/slider-2.png",
  //   mobileSrc: "/images/mobile/slider-2.png",
  //   alt: "Centrum Spotkań Black — strefa rozrywki",
  // },
  // {
  //   desktopSrc: "/images/desktop/slider-4.png",
  //   mobileSrc: "/images/mobile/slider-3.png",
  //   alt: "Centrum Spotkań Black — restauracja i spotkania",
  // },
] as const

function FadeInBg({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className: string
}) {
  const reduceMotion = useReducedMotion()
  const { loaded, animateIn, onLoaded } = useImageLoaded(src)

  React.useEffect(() => {
    if (loaded) return
    let alive = true

    const img = new Image()
    img.src = src
    img.onload = () => alive && onLoaded()
    img.onerror = () => alive && onLoaded() // nie blokuj UI jak fail

    return () => {
      alive = false
    }
    // `loaded` celowo poza zależnościami: po wczytaniu nie chcemy wracać
    // do stanu niewczytanego ani uruchamiać preloadu ponownie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, onLoaded])

  /*
 * Zanik prowadzony przejsciem CSS, nie framer-motion.
 *
 * Framer animuje `opacity` przez Web Animations API. Po zakonczeniu animacji
 * usuwa ja z elementu i przez JEDNA KLATKE obowiazuje wartosc bazowa, czyli
 * `initial` — a ta jest zerowa. Pomiar na stagingu pokazal to dokladnie:
 *
 *     +1373ms opacity 0.997  ->  +1391ms opacity 0  ->  +1406ms opacity 1
 *
 * Dla uzytkownika to mignięcie dokladnie w chwili, gdy obraz konczy sie
 * pojawiac. Zachowanie zalezy od momentu zatwierdzenia animacji w Chromium,
 * dlatego widac je na Chrome, a nie na Safari w iOS.
 *
 * Przejscie CSS nie ma tego przekazania: wartosc docelowa jest jednoczesnie
 * wartoscia stylu, wiec nie ma do czego wracac. Czas i krzywa pozostaja te same.
 */
  return (
    <div
      className={className}
      style={{
        backgroundImage: `url(${src})`,
        opacity: loaded ? 1 : 0,
        // Brak przejscia, gdy obraz byl juz wczytany — wtedy nie animujemy.
        transition: reduceMotion || !animateIn ? undefined : "opacity 0.35s ease-out",
      }}
      role="img"
      aria-label={alt}
    />
  )
}

export default function HeroSection({
  api,
  setApi,
}: {
  api: CarouselApi | undefined
  setApi: (api: CarouselApi) => void
}) {
  return (
    <section aria-labelledby="hero-title" className="w-full">
      <div
        className={[
          "relative w-full overflow-hidden",
          "h-[calc(100svh-var(--header-height,64px))]",
          "md:h-[520px]",
          "md:rounded-xl md:border md:shadow-sm",
        ].join(" ")}
      >
        <Carousel
          aria-label="Karuzela zdjęć w sekcji głównej"
          opts={{ align: "start", loop: true }}
          setApi={setApi}
          className="h-full w-full [&>div]:h-full [&>div>div]:h-full"
        >
          <CarouselContent className="h-full items-stretch !ml-0">
            {HERO_SLIDES.map((s, idx) => (
              <CarouselItem key={idx} className="h-full min-h-0 !pl-0">
                <div className="relative h-full w-full">
                  <FadeInBg
                    src={s.mobileSrc}
                    alt={s.alt}
                    className="absolute inset-0 bg-cover bg-center md:hidden"
                  />
                  <FadeInBg
                    src={s.desktopSrc}
                    alt={s.alt}
                    className="absolute inset-0 hidden bg-cover bg-center md:block"
                  />

                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/90 via-black/30 to-black/90"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        {/* overlay */}
        <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-center">
          <div className="w-full px-4 pb-8 sm:px-6 md:px-8">
            <div className="md:mx-auto">
              <div className="max-w-2xl text-white">
                <h1
                  id="hero-title"
                  className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl md:text-5xl"
                >
                  Jedzenie.
                  <br />
                  Rozrywka.
                  <br />
                  Wspólne chwile.
                </h1>

                <p className="mt-2 text-sm text-white/85 sm:text-base">
                  Restauracja, imprezy, kręgle i bilard.
                </p>

                <div className="mt-4 pointer-events-auto">
                  <Button asChild variant="brand" className="px-8 py-2">
                    <Link href="/rezerwacje">Zarezerwuj</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* dots pod hero: ukryte na mobile */}
      <div className="mt-3 hidden justify-center md:flex">
        <DotNav api={api} label="Nawigacja karuzeli w sekcji głównej" />
      </div>
    </section>
  )
}
