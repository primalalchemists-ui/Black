import type { SiteSettings } from "@/lib/siteSettings"
import { Clock, Mail, MapPin, Phone } from "lucide-react"

const WEEKEND_KEYS = ["saturday", "sunday", "sobota", "niedziela", "sat", "sun"]

function isWeekend(key: string) {
  return WEEKEND_KEYS.some((k) => key.toLowerCase().includes(k))
}

export default function PlaceInfoSection({ settings }: { settings: SiteSettings }) {
  const openingHours = settings.openingHours ?? []
  const hasDescription = Boolean(settings.description?.trim())
  const hasHours = openingHours.length > 0

  if (!hasDescription && !hasHours) return null

  return (
    <section aria-labelledby="place-info-title" className="mx-auto w-full px-4 md:px-0">
      {/* nagłówek z akcentem */}
      <div className="mb-8 flex items-center gap-4">
        <h2 id="place-info-title" className="text-2xl font-semibold">
          Informacje
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* dwukolumnowy layout */}
      <div className="grid gap-10 md:grid-cols-2 md:gap-16">

        {/* opis miejsca */}
        {hasDescription && (
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              O miejscu
            </p>
            <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">
              {settings.description}
            </p>
            <div className="mt-auto flex flex-col gap-2.5">
              {settings.address && (
                <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                  <span>{settings.address}</span>
                </div>
              )}
              {settings.phone && (
                <a
                  href={`tel:${settings.phone}`}
                  className="flex items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Phone className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                  <span>{settings.phone}</span>
                </a>
              )}
              {settings.email && (
                <a
                  href={`mailto:${settings.email}`}
                  className="flex items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Mail className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
                  <span>{settings.email}</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* godziny otwarcia */}
        {hasHours && (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-[hsl(var(--brand))]" />
              Godziny otwarcia
            </p>

            <ul className="grid gap-0 divide-y divide-border/50">
              {openingHours.map((d) => {
                const weekend = isWeekend(d.key)
                const closed = d.open === "–" || d.open === "-" || !d.open
                return (
                  <li
                    key={d.key}
                    className={`flex items-center justify-between py-2.5 text-sm ${
                      weekend ? "font-medium" : ""
                    }`}
                  >
                    <span className={closed ? "text-muted-foreground" : ""}>{d.label}</span>
                    <span
                      className={`tabular-nums ${
                        closed
                          ? "text-muted-foreground/60 italic"
                          : weekend
                          ? "text-[hsl(var(--brand))]"
                          : "text-foreground/70"
                      }`}
                    >
                      {closed ? "nieczynne" : `${d.open} – ${d.close}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* jeśli nie ma opisu, godziny zajmują całą szerokość */}
        {!hasDescription && hasHours && null}
      </div>
    </section>
  )
}
