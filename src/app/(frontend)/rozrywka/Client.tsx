"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { CarouselApi } from "@/components/ui/carousel";

import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import DotNav from "@/components/home/components/DotNav";
import { FadeInImage } from "@/components/ui/FadeInImage";

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


function pluralPL(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

type ActivityCardProps = {
  photo: string;
  alt: string;
  title: string;
  loading: boolean;
  enabled: boolean;
  disabledMsg?: string;
  price: number;
  countLabel: string;
  href: string;
  ctaLabel: string;
};

function ActivityCard({
  photo,
  alt,
  title,
  loading,
  enabled,
  disabledMsg,
  price,
  countLabel,
  href,
  ctaLabel,
}: ActivityCardProps) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.18)] md:aspect-[16/7]">
      {/* Full-bleed photo */}
      <FadeInImage
        src={photo}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />


      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-black/50 px-4 py-3 backdrop-blur-sm">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <MotionWrap k={`${title}-loading`} className="flex w-full items-center justify-between gap-3">
              <div role="status" aria-live="polite" className="h-8 w-32 rounded-full bg-white/20 animate-pulse" />
              <div className="h-6 w-28 rounded-full bg-white/10 animate-pulse" />
            </MotionWrap>
          ) : enabled ? (
            <MotionWrap k={`${title}-ready`} className="flex w-full items-center justify-between gap-3">
              <Button asChild className="bg-white text-black hover:bg-white/90">
                <Link href={href}>{ctaLabel}</Link>
              </Button>
              <span className="text-xs font-medium text-white/80 shrink-0">
                {price} zł / godz. · {countLabel}
              </span>
            </MotionWrap>
          ) : (
            <MotionWrap k={`${title}-disabled`} className="flex w-full items-center justify-between gap-3">
              <Button size="sm" disabled aria-disabled="true" className="rounded-full">
                {ctaLabel}
              </Button>
              <span className="text-xs text-white/60 shrink-0">
                {disabledMsg || "Chwilowo wyłączone"}
              </span>
            </MotionWrap>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
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
    <div className="grid gap-8 px-4 py-4 md:px-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rozrywka</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bilard, kręgle i wydarzenia specjalne.</p>
      </div>

      {/* Events */}
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
              <div className="mt-3 hidden justify-center md:flex">
                <DotNav api={api} label="Nawigacja karuzeli wydarzeń" />
              </div>
            </div>
          </MotionWrap>
        )}
      </AnimatePresence>

      {/* Bilard + Kręgle */}
      <div className="grid gap-4 md:grid-cols-2">
        <ActivityCard
          photo="/images/20260503_184125.jpg"
          alt="Bilard w Centrum Spotkań Black"
          title="Bilard"
          loading={loadingSettings}
          enabled={billiardEnabled}
          disabledMsg={billiardDisabledMsg}
          price={billiardPrice}
          countLabel={`do ${billiardTables} ${pluralPL(billiardTables, "stołu", "stołów")}`}
          href="/rezerwacje/bilard"
          ctaLabel="Rezerwuj bilard"
        />
        <ActivityCard
          photo="/images/20260524_160458.jpg"
          alt="Kręgle w Centrum Spotkań Black"
          title="Kręgle"
          loading={loadingSettings}
          enabled={bowlingEnabled}
          disabledMsg={bowlingDisabledMsg}
          price={bowlingPrice}
          countLabel={`do ${bowlingLanes} ${pluralPL(bowlingLanes, "toru", "torów")}`}
          href="/rezerwacje/kregle"
          ctaLabel="Rezerwuj kręgle"
        />
      </div>
    </div>
  );
}
