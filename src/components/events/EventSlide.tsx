"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { CmsEvent, getEventDisplayDateTimePL, renderPricePLN } from "@/lib/cms/events";
import { FadeInImage } from "@/components/ui/FadeInImage";

const FALLBACK_IMG = "/images/icons/black-heart.png";

export function EventSlide({
  e,
  actionLabel,
  onAction,
}: {
  e: CmsEvent;
  actionLabel?: string;
  onAction?: (eventId: string) => void;
}) {
  const dt = getEventDisplayDateTimePL(e);
  const priceLabel = renderPricePLN(e.pricePLN);
  const capacity = typeof e.capacity === "number" ? e.capacity : null;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr_auto] md:items-start">
      <div className="relative h-48 w-full md:h-44">
        <FadeInImage
          src={e.imageUrl || FALLBACK_IMG}
          alt={e.imageUrl ? `Grafika wydarzenia: ${e.title}` : "Czarne serce – brak grafiki wydarzenia"}
          className="h-full w-full object-contain"
          loading="lazy"
        />

        {!e.imageUrl ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
          />
        ) : null}
      </div>

      <div className="grid gap-1">
        <p className="font-medium">{e.title}</p>

        <p className="text-sm text-muted-foreground">
          {e.description?.trim() ? e.description : "Szczegóły wydarzenia będą dostępne wkrótce."}
        </p>

        {dt ? (
          <p className="text-sm font-medium">
            Data: {dt.date}, {dt.time}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Data: wkrótce</p>
        )}

        {priceLabel ? (
          <p className="text-sm">
            <span className="font-medium">Cena:</span> {priceLabel}{" "}
            <span className="text-muted-foreground">(płatność na miejscu)</span>
          </p>
        ) : null}

        {capacity != null ? (
          <p className="text-sm">
            <span className="font-medium">Limit miejsc:</span> {capacity}
          </p>
        ) : null}
      </div>

      {actionLabel && onAction ? (
        <Button
          type="button"
          className="bg-black text-white hover:bg-black/90 md:self-start"
          onClick={() => onAction(String(e.id))}
          aria-label={`${actionLabel}: ${e.title}`}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
