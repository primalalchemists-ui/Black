"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { CarouselApi } from "@/components/ui/carousel";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import DotNav from "@/components/home/components/DotNav";

import { safeFetchJson } from "@/lib/cms/http";
import { fetchEventsNotBusiness, type CmsEvent } from "@/lib/cms/events";
import { EventSlide } from "@/components/events/EventSlide";

type ReservationSettings = {
  billiard?: { enabled?: boolean; disabledMessage?: string | null; pricePerHour?: number };
  bowling?: { enabled?: boolean; disabledMessage?: string | null; pricePerHour?: number };
};

type ResourceCounts = {
  billiardCount: number;
  laneCount: number;
};

async function fetchReservationSettings(): Promise<ReservationSettings | null> {
  return await safeFetchJson("/api/globals/reservation-settings?depth=2&draft=false");
}

async function fetchResourceCounts(): Promise<ResourceCounts | null> {
  return await safeFetchJson("/api/resources/count");
}

/** Motion wrapper */
function MotionWrap({
  k,
  children,
  className,
}: {
  k: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      key={k}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Skeletony z FIXED wysokością -> zero layout shift */
function EventsSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-[160px] w-full rounded-lg bg-muted animate-pulse" />
      <div className="hidden md:flex justify-center">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
      <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
    </div>
  );
}

function pluralPL(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export default function RozrywkaPage() {
  const [events, setEvents] = React.useState<CmsEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [api, setApi] = React.useState<CarouselApi | undefined>(undefined);

  const [settings, setSettings] = React.useState<ReservationSettings | null>(null);
  const [counts, setCounts] = React.useState<ResourceCounts | null>(null);
  const [loadingSettings, setLoadingSettings] = React.useState(true);

  React.useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [filteredEvents, s, c] = await Promise.all([
          fetchEventsNotBusiness(),
          fetchReservationSettings(),
          fetchResourceCounts(),
        ]);

        if (!alive) return;

        setEvents(filteredEvents);
        setSettings(s);
        setCounts(c);
      } finally {
        if (!alive) return;
        setLoadingEvents(false);
        setLoadingSettings(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const billiardEnabled = settings?.billiard?.enabled ?? true;
  const bowlingEnabled = settings?.bowling?.enabled ?? true;

  const billiardPrice = settings?.billiard?.pricePerHour ?? 50;
  const bowlingPrice = settings?.bowling?.pricePerHour ?? 120;

  const billiardDisabledMsg = settings?.billiard?.disabledMessage?.trim();
  const bowlingDisabledMsg = settings?.bowling?.disabledMessage?.trim();

  const billiardTables = counts?.billiardCount ?? 0;
  const bowlingLanes = counts?.laneCount ?? 0;

  return (
    <div className="grid gap-8 p-4">
      <h1 className="text-3xl font-semibold">Rozrywka</h1>

      {/* WYDARZENIA ROZRYWKOWE */}
      <AnimatePresence mode="wait" initial={false}>
        {loadingEvents ? (
          <MotionWrap k="events-loading">
            <div role="status" aria-live="polite">
              <EventsSkeleton />
            </div>
          </MotionWrap>
        ) : !events.length ? null : events.length === 1 ? (
          <MotionWrap k="events-single">
            <EventSlide e={events[0]!} href="/rezerwacje/stoliki" ctaLabel="Rezerwuj stolik" />
          </MotionWrap>
        ) : (
          <MotionWrap k="events-carousel" className="grid gap-3">
            <div className="relative w-full overflow-hidden">
              <Carousel
                aria-label="Karuzela wydarzeń rozrywkowych"
                opts={{ align: "start", loop: true, containScroll: "trimSnaps", slidesToScroll: 1 }}
                setApi={setApi as any}
                className="w-full overflow-hidden"
              >
                <CarouselContent className="-ml-4">
                  {events.map((e) => (
                    <CarouselItem key={String(e.id)} className="pl-4 basis-full md:basis-1/2">
                      <EventSlide e={e} href="/rezerwacje/stoliki" ctaLabel="Rezerwuj stolik" />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
              <div className="hidden justify-center md:flex mt-3">
                <DotNav api={api} label="Nawigacja karuzeli wydarzeń" />
              </div>
            </div>
          </MotionWrap>
        )}
      </AnimatePresence>

      {/* BILARD + KRĘGLE */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* BILARD */}
        <Card className="overflow-hidden">
          <div className="relative h-48 w-full md:h-44">
            <img
              src="/images/icons/bilard.png"
              alt="Ikona bilarda"
              className="h-full w-full object-contain"
              loading="lazy"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
            />
          </div>

          <CardHeader>
            <CardTitle>Bilard</CardTitle>
          </CardHeader>

          {/* FIXED min-height -> zero layout shift */}
          <CardContent className="grid gap-4 min-h-[140px]">
            <AnimatePresence mode="wait" initial={false}>
              {loadingSettings ? (
                <MotionWrap k="billiard-loading">
                  <div role="status" aria-live="polite">
                    <SettingsSkeleton />
                  </div>
                </MotionWrap>
              ) : (
                <MotionWrap k="billiard-ready" className="grid gap-4">
                  <>
                    {billiardEnabled ? (
                      <p className="text-muted-foreground">
                        {billiardPrice} zł / godz. Zarezerwuj do {billiardTables}{" "}
                        {pluralPL(billiardTables, "stołu", "stołów")}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        {billiardDisabledMsg || "Rezerwacje bilarda są chwilowo wyłączone."}
                      </p>
                    )}

                    <Button
                      asChild
                      variant="default"
                      className="bg-black text-white hover:bg-black/90"
                      disabled={!billiardEnabled}
                      aria-disabled={!billiardEnabled}
                    >
                      <Link href="/rezerwacje/bilard">Rezerwuj bilard</Link>
                    </Button>
                  </>
                </MotionWrap>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>

        {/* KRĘGLE */}
        <Card className="overflow-hidden">
          <div className="relative h-48 w-full md:h-44">
            <img
              src="/images/icons/bowling-transparent.png"
              alt="Ikona kręgli"
              className="h-full w-full object-contain"
              loading="lazy"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
            />
          </div>

          <CardHeader>
            <CardTitle>Kręgle</CardTitle>
          </CardHeader>

          {/* FIXED min-height -> zero layout shift */}
          <CardContent className="grid gap-4 min-h-[140px]">
            <AnimatePresence mode="wait" initial={false}>
              {loadingSettings ? (
                <MotionWrap k="bowling-loading">
                  <div role="status" aria-live="polite">
                    <SettingsSkeleton />
                  </div>
                </MotionWrap>
              ) : (
                <MotionWrap k="bowling-ready" className="grid gap-4">
                  <>
                    {bowlingEnabled ? (
                      <p className="text-muted-foreground">
                        {bowlingPrice} zł / godz. Zarezerwuj do {bowlingLanes}{" "}
                        {pluralPL(bowlingLanes, "toru", "torów")}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        {bowlingDisabledMsg || "Rezerwacje kręgli są chwilowo wyłączone."}
                      </p>
                    )}

                    <Button
                      asChild
                      variant="default"
                      className="bg-black text-white hover:bg-black/90"
                      disabled={!bowlingEnabled}
                      aria-disabled={!bowlingEnabled}
                    >
                      <Link href="/rezerwacje/kregle">Rezerwuj kręgle</Link>
                    </Button>
                  </>
                </MotionWrap>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
