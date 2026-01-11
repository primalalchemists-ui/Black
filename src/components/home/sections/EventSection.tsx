"use client"

import * as React from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import type { CarouselApi } from "@/components/ui/carousel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import DotNav from "@/components/home/components/DotNav"
import { FadeInImage } from "@/components/ui/FadeInImage"

type CmsEvent = {
  id: string
  title: string
  description?: string | null
  startsAt: string
  endsAt?: string | null
  capacity?: number | null
  kind?: "promo" | "business" | "party" | "sport"
  imageUrl?: string | null
}

const FALLBACK_IMG = "/images/icons/black-heart.png"

function formatDateTimePL(iso: string) {
  const d = new Date(iso)
  const date = d.toLocaleDateString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit" })
  const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
  return { date, time }
}

function routeForKind(kind: NonNullable<CmsEvent["kind"]>) {
  return kind === "business" ? "/biznes" : "/rozrywka"
}

function SkeletonCard() {
  return (
    <Card className="bg-muted/30 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)] overflow-hidden">
      <CardHeader>
        <CardTitle>Ładowanie…</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-muted animate-pulse" />
      </CardContent>
    </Card>
  )
}

/**
 * Karta jest klikalna w całości (Link overlay), ale layout wygląda tak samo.
 * Bonus: możesz dodać mały button "Więcej" jeśli chcesz, ale nie musisz.
 */
function EventCard({ e, href }: { e: CmsEvent; href: string }) {
  const { date, time } = formatDateTimePL(e.startsAt)

  return (
    <Card className="bg-muted/30 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)] overflow-hidden relative">
      {/* overlay link na całą kartę */}
      <Link href={href} aria-label={`Zobacz więcej: ${e.title}`} className="absolute inset-0 z-10" />

      <div className="flex items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <div className="text-base font-semibold line-clamp-2">{e.title}</div>

          <div className="mt-2 grid gap-2">
            {/* {e.description ? (
              <p className="text-muted-foreground line-clamp-2">{e.description}</p>
            ) : (
              <p className="text-muted-foreground">Szczegóły i data będą pobierane z panelu CMS.</p>
            )} */}

            <p className="text-sm">
              <span className="font-medium">Dzień:</span> {date} <br />
              <span className="font-medium">Start:</span> {time}
            </p>
          </div>
        </div>

        <FadeInImage
          src={e.imageUrl || FALLBACK_IMG}
          alt={e.imageUrl ? e.title : "Czarne serce – brak grafiki wydarzenia"}
          className={
            e.imageUrl
              ? "h-30 w-40 md:h-40 md:w-60 shrink-0 object-contain"
              : "h-20 w-20 shrink-0 object-contain"
          }
          loading="lazy"
        />
      </div>

      {/* jeśli chcesz zostawić widoczny button: */}
      <div className="px-6 pb-6 relative z-20">
        <Button asChild variant="secondary" className="pointer-events-auto">
          <Link href={href}>Zobacz więcej</Link>
        </Button>
      </div>
    </Card>
  )
}

export default function EventSection() {
  const [events, setEvents] = React.useState<CmsEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [api, setApi] = React.useState<CarouselApi | undefined>(undefined)

  React.useEffect(() => {
    let alive = true

    async function run() {
      try {
        const res = await fetch("/api/cms/events", { cache: "no-store" })
        if (!res.ok) throw new Error(`Events fetch failed: ${res.status}`)
        const json = await res.json()
        const list: CmsEvent[] = Array.isArray(json?.events) ? json.events : []
        if (alive) setEvents(list)
      } catch {
        if (alive) setEvents([])
      } finally {
        if (alive) setLoading(false)
      }
    }

    run()
    return () => {
      alive = false
    }
  }, [])

  // ✅ klucz: pokazujemy tylko eventy z kind (żeby routing był zawsze poprawny)
  const routedEvents = React.useMemo(() => {
    return events.filter((e) => !!e.kind)
  }, [events])

  // jeśli nie ma kind -> traktuj jak brak wydarzeń
  if (!loading && routedEvents.length === 0) return null

  return (
    <section aria-labelledby="event-title" className="mx-auto grid w-full gap-4 px-4 md:px-0">
      <div className="flex items-end justify-between gap-3">
        <h2 id="event-title" className="text-2xl font-semibold">
          {loading || routedEvents.length <= 1 ? "Nadchodzące wydarzenie" : "Nadchodzące wydarzenia"}
        </h2>

        {/* ❌ usuwamy globalny przycisk na desktop, bo jest niejednoznaczny przy 2 kartach */}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid gap-3"
          >
            <SkeletonCard />
          </motion.div>
        ) : routedEvents.length === 1 ? (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid gap-3"
          >
            <EventCard e={routedEvents[0]!} href={routeForKind(routedEvents[0]!.kind!)} />
          </motion.div>
        ) : (
          <motion.div
            key="carousel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid gap-3"
          >
            <div className="relative w-full overflow-hidden">
              <Carousel
                aria-label="Karuzela nadchodzących wydarzeń"
                opts={{
                  align: "start",
                  containScroll: "trimSnaps",
                  slidesToScroll: 1,
                  loop: true,
                }}
                setApi={setApi as any}
                className="w-full overflow-hidden"
              >
                <CarouselContent className="-ml-4">
                  {routedEvents.map((e) => (
                    <CarouselItem key={e.id} className="pl-4 basis-full">
                      <EventCard e={e} href={routeForKind(e.kind!)} />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>

              <DotNav api={api} label="Nawigacja karuzeli wydarzeń" className="mt-3" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
