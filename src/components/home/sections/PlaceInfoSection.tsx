import type { SiteSettings } from "@/lib/siteSettings"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function formatClose(close: string) {
  return close
}

export default function PlaceInfoSection({ settings }: { settings: SiteSettings }) {
  const openingHours = settings.openingHours ?? []
  const hasDescription = Boolean(settings.description?.trim())
  const hasHours = openingHours.length > 0

  if (!hasDescription && !hasHours) return null

  return (
    <section aria-labelledby="place-info-title" className="mx-auto mb-24 grid  gap-4 px-4 md:px-0">
      <h2 id="place-info-title" className="text-2xl font-semibold">
        Informacje
      </h2>

      <Card className="bg-muted/30 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)]">
        {hasDescription ? (
          <CardHeader>
            <CardTitle>O miejscu</CardTitle>
          </CardHeader>
        ) : null}

        <CardContent className="grid gap-6 py-6">
          {hasDescription ? (
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {settings.description}
            </p>
          ) : null}

          {hasHours ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Godziny otwarcia</p>
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {openingHours.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-4">
                    <span>{d.label}</span>
                    <span className="tabular-nums">
                      {d.open} – {formatClose(d.close)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
