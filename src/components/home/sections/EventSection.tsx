"use client"

import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { CarouselApi } from "@/components/ui/carousel"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import DotNav from "@/components/home/components/DotNav"
import { EventSlide } from "@/components/events/EventSlide"
import type { CmsEvent } from "@/lib/cms/events"

function reservationHref(e: CmsEvent) {
  const base = e.kind === "biznes" ? "/rezerwacje/biznes" : "/rezerwacje/imprezy"
  return `${base}?eventId=${e.id}`
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="grid md:grid-cols-[3fr_2fr]">
        <div className="aspect-[16/9] animate-pulse bg-muted md:aspect-auto md:min-h-[300px]" />
        <div className="flex flex-col gap-4 p-6 md:p-8">
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-auto h-10 w-36 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </div>
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
    return () => { alive = false }
  }, [])

  const routedEvents = React.useMemo(() => events.filter((e) => !!e.kind && e.showOnHomepage === true), [events])

  if (!loading && routedEvents.length === 0) return null

  const isMultiple = !loading && routedEvents.length > 1

  return (
    <section aria-labelledby="event-title" className="mx-auto grid w-full gap-4 px-4 md:px-0">
      <div className="flex items-center justify-between gap-4">
        <h2 id="event-title" className="text-2xl font-semibold">
          {loading || routedEvents.length <= 1 ? "Nadchodzące wydarzenie" : "Nadchodzące wydarzenia"}
        </h2>
        {isMultiple && (
          <DotNav
            api={api}
            label="Nawigacja karuzeli wydarzeń"
            variant="numbers"
          />
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
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
          >
            <EventSlide
              e={routedEvents[0]!}
              href={reservationHref(routedEvents[0]!)}
              ctaLabel="Zapisz się"
            />
          </motion.div>
        ) : (
          <motion.div
            key="carousel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Carousel
              aria-label="Karuzela nadchodzących wydarzeń"
              opts={{ align: "start", containScroll: "trimSnaps", slidesToScroll: 1, loop: true }}
              setApi={setApi as any}
              className="w-full overflow-hidden"
            >
              <CarouselContent className="-ml-4">
                {routedEvents.map((e) => (
                  <CarouselItem key={String(e.id)} className="pl-4 basis-full">
                    <EventSlide
                      e={e}
                      href={reservationHref(e)}
                      ctaLabel="Zapisz się"
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
