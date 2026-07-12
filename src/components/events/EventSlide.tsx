"use client";

import { useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CmsEvent, getEventDisplayDateTimePL, renderPricePLN } from "@/lib/cms/events";
import { FadeInImage } from "@/components/ui/FadeInImage";

const FALLBACK_IMG = "/images/icons/black-heart.png";

const KIND_LABEL: Record<NonNullable<CmsEvent["kind"]>, string> = {
  impreza: "Impreza",
  biznes: "Biznes",
};

export function EventSlide({
  e,
  href,
  ctaLabel = "Zarezerwuj stolik",
  actionLabel,
  onAction,
}: {
  e: CmsEvent;
  href?: string;
  ctaLabel?: string;
  actionLabel?: string;
  onAction?: (eventId: string) => void;
}) {
  const dt = getEventDisplayDateTimePL(e);
  const priceLabel = renderPricePLN(e.pricePLN);
  const capacity = typeof e.capacity === "number" ? e.capacity : null;
  const takenSeats = typeof e.takenSeats === "number" ? e.takenSeats : null;
  const spotsLeft = capacity !== null && takenSeats !== null ? Math.max(0, capacity - takenSeats) : null;
  const hasImage = Boolean(e.imageUrl);

  const endTime = (() => {
    if (e.endHour != null && e.endMinute != null) {
      const h = String(Number(e.endHour)).padStart(2, "0");
      const m = String(Number(e.endMinute)).padStart(2, "0");
      return `${h}:${m}`;
    }
    return null;
  })();

  const showCtaButton = Boolean(href);
  const showActionButton = Boolean(actionLabel && onAction);
  const [descExpanded, setDescExpanded] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_8px_32px_-8px_rgba(0,0,0,0.10)]">
      {href && (
        <Link href={href} aria-label={`Więcej o: ${e.title}`} className="absolute inset-0 z-10" />
      )}

      <div className="grid md:grid-cols-2">
        {/* ZDJĘCIE */}
        <div className="relative aspect-[16/9] overflow-hidden bg-muted md:aspect-auto md:min-h-[300px]">
          <FadeInImage
            src={e.imageUrl || FALLBACK_IMG}
            alt={hasImage ? e.title : "Centrum Spotkań Black"}
            className={
              hasImage
                ? "absolute inset-0 h-full w-full object-cover"
                : "absolute inset-0 h-full w-full object-contain p-12 opacity-20"
            }
            loading="lazy"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-black/10" />
        </div>

        {/* TREŚĆ */}
        <div className="flex flex-col gap-5 p-6 md:p-8">
          {e.kind && (
            <span className="inline-flex w-fit items-center rounded-full bg-[hsl(var(--brand-soft))] px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--brand-foreground))]">
              {KIND_LABEL[e.kind]}
            </span>
          )}

          <h3 className="text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {e.title}
          </h3>

          {e.description?.trim() && (
            <div className="relative z-20">
              <p className={`whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${descExpanded ? "max-h-[5.75rem] overflow-y-auto pr-1" : "line-clamp-4"}`}>
                {e.description}
              </p>
              <button
                type="button"
                onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setDescExpanded((x) => !x); }}
                className="pointer-events-auto mt-1 text-xs font-medium text-[hsl(var(--brand))] hover:underline"
              >
                {descExpanded ? "Zwiń" : "Czytaj więcej"}
              </button>
            </div>
          )}

          <div className="flex flex-col gap-2 text-sm">
            {dt && (
              <>
                <div className="flex items-center gap-2 text-foreground/80">
                  <Calendar className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                  <span className="font-medium">{dt.date}</span>
                </div>
                <div className="flex items-center gap-2 text-foreground/80">
                  <Clock className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                  <span className="font-medium">
                    {dt.time}{endTime ? ` – ${endTime}` : ""}
                  </span>
                </div>
              </>
            )}
            {spotsLeft !== null ? (
              <div className="flex items-center gap-2 text-foreground/80">
                <Users className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                <span className={`font-medium ${spotsLeft === 0 ? "text-destructive" : spotsLeft <= 5 ? "text-amber-600" : ""}`}>
                  {spotsLeft === 0
                    ? "Brak miejsc"
                    : `Pozostało: ${spotsLeft} ${spotsLeft === 1 ? "miejsce" : spotsLeft < 5 ? "miejsca" : "miejsc"}`}
                </span>
              </div>
            ) : capacity !== null ? (
              <div className="flex items-center gap-2 text-foreground/80">
                <Users className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                <span className="font-medium">Limit: {capacity} osób</span>
              </div>
            ) : null}
            {priceLabel && (
              <p className="text-sm text-muted-foreground">
                Cena: <span className="font-medium text-foreground">{priceLabel}</span>
              </p>
            )}
          </div>

          {(showCtaButton || showActionButton) && (
            <div className="relative z-20 mt-auto pt-2">
              {showCtaButton && href && (
                e.registrationsEnabled === false ? (
                  <Button
                    disabled
                    className="pointer-events-auto w-full bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
                  >
                    Zapisy zamknięte
                  </Button>
                ) : spotsLeft === 0 ? (
                  <Button
                    disabled
                    className="pointer-events-auto w-full bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
                  >
                    Brak miejsc
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="pointer-events-auto w-full bg-primary text-primary-foreground hover:bg-[hsl(30,4%,18%)] hover:text-primary-foreground"
                  >
                    <Link href={href}>{ctaLabel}</Link>
                  </Button>
                )
              )}
              {showActionButton && !showCtaButton && (
                <Button
                  type="button"
                  className="pointer-events-auto w-full bg-primary text-primary-foreground hover:bg-[hsl(30,4%,18%)] hover:text-primary-foreground"
                  onClick={() => onAction!(String(e.id))}
                  aria-label={`${actionLabel}: ${e.title}`}
                >
                  {actionLabel}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
