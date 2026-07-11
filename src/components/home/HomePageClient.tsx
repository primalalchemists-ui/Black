"use client"

import * as React from "react"
import type { CarouselApi } from "@/components/ui/carousel"
import type { SiteSettings } from "@/lib/siteSettings"

import HeroSection from "@/components/home/sections/HeroSection"
import EventSection from "@/components/home/sections/EventSection"
import OfferSection from "@/components/home/sections/OfferSection"
import GallerySection from "@/components/home/sections/GallerySection"
import PlaceInfoSection from "@/components/home/sections/PlaceInfoSection"

export default function HomePageClient({ settings }: { settings: SiteSettings }) {
  const [heroApi, setHeroApi] = React.useState<CarouselApi>()

  // AUTO-LOOP HERO co 5s (szanuje prefers-reduced-motion)
  React.useEffect(() => {
    if (!heroApi) return
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches

    if (reduced) return

    const id = window.setInterval(() => {
      heroApi.scrollNext()
    }, 5000)

    return () => window.clearInterval(id)
  }, [heroApi])

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="grid w-full max-w-full gap-12">
        <HeroSection setApi={setHeroApi} api={heroApi} />

        <EventSection />

        <OfferSection />
        <PlaceInfoSection settings={settings} />
        <div className="mx-auto w-full px-4 md:px-0">
          <div className="h-px bg-border" />
        </div>
        <GallerySection />
      </div>
    </div>
  )
}
