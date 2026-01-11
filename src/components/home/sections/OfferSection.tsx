"use client"

import Link from "next/link"
import type { CarouselApi } from "@/components/ui/carousel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import DotNav from "@/components/home/components/DotNav"

type OfferItem = {
  title: string
  desc: string
  href: string
  image: {
    desktop: string
    mobile: string
    alt: string
  }
}

const OFFER: OfferItem[] = [
  {
    title: "Restauracja",
    desc: "Poznaj ofertę naszych dań.",
    href: "/restauracja",
    image: {
      desktop: "/images/icons/restaurant-2.png",
      mobile: "/images/icons/restaurant-2.png",
      alt: "Restauracja – dania i oferta kuchni Centrum Spotkań Black",
    },
  },
  {
    title: "Rozrywka",
    desc: "Kręgle, bilard i kącik kibica.",
    href: "/rozrywka",
    image: {
      desktop: "/images/icons/bowling.png",
      mobile: "/images/icons/bowling.png",
      alt: "Rozrywka – kręgle i bilard w Centrum Spotkań Black",
    },
  },
  {
    title: "Imprezy",
    desc: "Urodziny, komunie, stypy, chrzciny.",
    href: "/imprezy",
    image: {
      desktop: "/images/icons/party.png",
      mobile: "/images/icons/party.png",
      alt: "Imprezy okolicznościowe – sala i atmosfera Centrum Spotkań Black",
    },
  },
  {
    title: "Biznes",
    desc: "Konferencje i szkolenia.",
    href: "/biznes",
    image: {
      desktop: "/images/icons/biznes.png",
      mobile: "/images/icons/biznes.png",
      alt: "Biznes – konferencje i szkolenia w Centrum Spotkań Black",
    },
  },
]

export default function OfferSection({
  api,
  setApi,
}: {
  api: CarouselApi | undefined
  setApi: (api: CarouselApi) => void
}) {
  return (
    <section aria-labelledby="offer-title" className="mx-auto grid w-full gap-4 px-4 md:px-0">
      <h2 id="offer-title" className="text-2xl font-semibold">
        Oferta
      </h2>

      <div className="relative w-full overflow-hidden">
        <Carousel
          aria-label="Karuzela oferty"
          opts={{
            align: "start",
            containScroll: "trimSnaps",
            slidesToScroll: 1,
          }}
          setApi={setApi}
          className="w-full overflow-hidden"
        >
          <CarouselContent className="-ml-4">
            {OFFER.map((t) => (
              <CarouselItem key={t.title} className="pl-4 basis-full md:basis-1/2">
                <Card className="h-full overflow-hidden">
                  <div className="relative h-48 w-full md:h-44">
                    <img
                      src={t.image.mobile}
                      alt={t.image.alt}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
                    />
                  </div>

                  <CardHeader>
                    <CardTitle>{t.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <p className="text-muted-foreground">{t.desc}</p>
                    <Button asChild variant="secondary">
                      <Link href={t.href}>Więcej</Link>
                    </Button>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>

        <DotNav api={api} label="Nawigacja karuzeli oferty" className="mt-3" />
      </div>
    </section>
  )
}
