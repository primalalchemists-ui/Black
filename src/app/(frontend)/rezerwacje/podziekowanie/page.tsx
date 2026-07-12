import Link from "next/link"
import { CheckCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getPayload } from "payload"
import config from "@payload-config"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Dziękujemy za rezerwację | Centrum Spotkań Black",
  description: "Rezerwacja przyjęta. Potwierdzenie zostanie wysłane e-mailem.",
}

function fmt2(n: number) {
  return String(n).padStart(2, "0")
}

function formatStatus(status: string) {
  if (status === "paid") return "Opłacono"
  if (status === "pending") return "Oczekuje na potwierdzenie płatności"
  if (status === "failed") return "Płatność nieudana"
  if (status === "not_required") return "Płatność nie jest wymagana"
  return status
}

function formatType(type: string) {
  if (type === "kregle") return "Kręgle"
  if (type === "bilard") return "Bilard"
  if (type === "stolik") return "Stolik"
  if (type === "biznes") return "Wydarzenie biznesowe"
  if (type === "impreza") return "Impreza"
  return type
}

export default async function PodziekowaniePageWrapper({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  const params = await searchParams
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : ""

  let docs: any[] = []
  let wasAbandoned = false

  if (sessionId) {
    try {
      const payload = await getPayload({ config })
      const result = await payload.find({
        collection: "reservations",
        limit: 20,
        depth: 1,
        where: { groupId: { equals: sessionId } },
        overrideAccess: true,
      })
      docs = result.docs as any[]

      const allPending = docs.length > 0 && docs.every((d) => d.paymentStatus === "pending")

      if (allPending) {
        // Check if a payment callback arrived (payment record exists = P24 confirmed payment)
        const paymentCheck = await payload.find({
          collection: "payments",
          limit: 1,
          overrideAccess: true,
          where: { p24SessionId: { equals: sessionId } },
        })
        const callbackArrived = paymentCheck.docs.length > 0

        if (!callbackArrived) {
          // User left P24 without paying — cancel the pending reservation immediately
          wasAbandoned = true
          for (const doc of docs) {
            try {
              await payload.delete({ collection: "reservations", id: doc.id, overrideAccess: true })
            } catch (delErr) {
              console.error("[podziekowanie] delete failed, cancelling:", delErr)
              await payload.update({
                collection: "reservations",
                id: doc.id,
                overrideAccess: true,
                data: { status: "cancelled", paymentStatus: "failed" } as any,
              }).catch(() => {})
            }
          }
          docs = []
        } else {
          // Callback arrived but reservation not yet updated (race condition) — re-fetch
          const refreshed = await payload.find({
            collection: "reservations",
            limit: 20,
            depth: 1,
            where: { groupId: { equals: sessionId } },
            overrideAccess: true,
          })
          docs = refreshed.docs as any[]
        }
      }
    } catch (err) {
      console.error("[podziekowanie] Błąd pobierania rezerwacji:", err)
    }
  }

  const first = docs[0]
  const isPaid = docs.length > 0 && docs.every((d) => d.paymentStatus === "paid")
  const isPending = docs.length > 0 && docs.some((d) => d.paymentStatus === "pending")
  const isNotRequired = docs.length > 0 && docs.every((d) => d.paymentStatus === "not_required")

  const dateISO = first ? String(first.day ?? "").slice(0, 10) : ""
  const [y, m, d] = dateISO ? dateISO.split("-") : ["", "", ""]
  const dateDisplay = dateISO ? `${d}.${m}.${y}` : ""

  const totalPLN = docs.reduce((acc, doc) => acc + Number(doc.depositAmount ?? 0), 0)

  const firstType = first?.type as string | undefined
  const isEvent = firstType === "impreza" || firstType === "biznes"

  let eventTitle: string | null = null
  const eventPartySize = isEvent ? (Number(first?.partySize) || null) : null

  if (isEvent && first?.event) {
    const eventId = typeof first.event === "string" ? first.event : String((first.event as any)?.id ?? "")
    if (eventId) {
      try {
        const payload = await getPayload({ config })
        const eventDoc = await payload.findByID({
          collection: "events",
          id: eventId,
          depth: 0,
          overrideAccess: true,
          context: { skipTakenSeats: true } as any,
        })
        eventTitle = (eventDoc as any)?.title ?? null
      } catch {}
    }
  }

  const segments = isEvent ? [] : docs.flatMap((doc) => {
    const type = doc.type as string
    const reservationNumber = String(doc.reservationNumber ?? doc.id)

    if (type === "stolik") {
      const startHH = `${fmt2(Number(doc.startHour ?? 0))}:${fmt2(Number(doc.startMinute ?? 0))}`
      const n = Number(doc.partySize) || 1
      const personLabel = n === 1 ? "1 osoby" : `${n} osób`
      return [{ resourceLabel: `Dla ${personLabel}`, startHH, endHH: null as string | null, reservationNumber }]
    }

    // Nowy format: segmenty per zasób (depth:1 populuje obiekt resource)
    const segs = Array.isArray(doc.segments) ? doc.segments as any[] : []
    if (segs.length > 0) {
      return segs.map((seg: any) => {
        const resObj = seg.resource && typeof seg.resource === "object" ? seg.resource : null
        const num = resObj?.number ?? "?"
        const resourceLabel = type === "kregle" ? `Tor ${num}` : `Stół ${num}`
        const startHH = `${fmt2(Number(seg.startHour ?? 0))}:${fmt2(Number(seg.startMinute ?? 0))}`
        const endHH = `${fmt2(Number(seg.endHour ?? 0))}:${fmt2(Number(seg.endMinute ?? 0))}`
        return { resourceLabel, startHH, endHH: endHH as string | null, reservationNumber }
      })
    }

    // Fallback: stary format (wiele rekordów per zasób)
    const startHH = `${fmt2(Number(doc.startHour ?? 0))}:${fmt2(Number(doc.startMinute ?? 0))}`
    const endHH = `${fmt2(Number(doc.endHour ?? 0))}:${fmt2(Number(doc.endMinute ?? 0))}`
    const resourceList = (doc.resources as any[]) ?? []
    const nums = resourceList
      .map((r: any) => (r && typeof r === "object" ? r.number : null))
      .filter((n: any) => n != null)
    if (!nums.length) {
      const resourceLabel = type === "kregle" ? "Tor ?" : "Stół ?"
      return [{ resourceLabel, startHH, endHH: endHH as string | null, reservationNumber }]
    }
    return nums.map((num: any) => {
      const resourceLabel = type === "kregle" ? `Tor ${num}` : `Stół ${num}`
      return { resourceLabel, startHH, endHH: endHH as string | null, reservationNumber }
    })
  })

  const eventStartHH = isEvent && first?.startHour != null
    ? `${fmt2(Number(first.startHour ?? 0))}:${fmt2(Number(first.startMinute ?? 0))}`
    : null

  if (wasAbandoned) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-6 flex justify-center">
            <Clock className="h-16 w-16 text-muted-foreground" />
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight">Płatność nie została ukończona</h1>
          <p className="mb-8 text-muted-foreground">
            Rezerwacja została anulowana. Możesz spróbować ponownie.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/rezerwacje">Wróć do rezerwacji</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Strona główna</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          {isPaid || isNotRequired ? (
            <CheckCircle className="h-16 w-16 text-green-500" />
          ) : (
            <Clock className="h-16 w-16 text-amber-500" />
          )}
        </div>

        <h1 className="mb-3 text-3xl font-bold tracking-tight">Dziękujemy!</h1>

        {docs.length > 0 ? (
          <>
            <p className="mb-6 text-base text-muted-foreground">
              {isPaid || isNotRequired
                ? "Rezerwacja potwierdzona. Potwierdzenie zostało wysłane na podany adres e-mail."
                : "Rezerwacja przyjęta. Oczekujemy na potwierdzenie płatności przez Przelewy24."}
            </p>

            <div className="mb-8 rounded-2xl border bg-card px-6 py-5 text-left">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Szczegóły rezerwacji
                </span>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
                    isPaid
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {formatStatus(first?.paymentStatus ?? "")}
                </span>
              </div>

              <dl className="grid gap-3">
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Usługa</dt>
                  <dd className="font-medium">{formatType(first?.type ?? "")}</dd>
                </div>

                {eventTitle ? (
                  <div className="flex justify-between text-sm">
                    <dt className="text-muted-foreground">Wydarzenie</dt>
                    <dd className="font-medium text-right max-w-[200px]">{eventTitle}</dd>
                  </div>
                ) : null}

                {dateDisplay ? (
                  <div className="flex justify-between text-sm">
                    <dt className="text-muted-foreground">Data</dt>
                    <dd className="font-medium">
                      {dateDisplay}
                      {eventStartHH ? `, godz. ${eventStartHH}` : ""}
                    </dd>
                  </div>
                ) : null}

                {eventPartySize ? (
                  <div className="flex justify-between text-sm">
                    <dt className="text-muted-foreground">Liczba osób</dt>
                    <dd className="font-medium">{eventPartySize}</dd>
                  </div>
                ) : null}

                {segments.length > 0 && (
                  <div className="border-t pt-3">
                    <dt className="mb-2 text-sm text-muted-foreground">Zarezerwowane</dt>
                    <dd>
                      <ul className="grid gap-1.5">
                        {segments.map((s, i) => (
                          <li key={i} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{s.resourceLabel}</span>
                            <span className="text-muted-foreground">
                              {s.endHH ? `${s.startHH}–${s.endHH}` : s.startHH}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}

                {totalPLN > 0 && (
                  <div className="flex justify-between border-t pt-3 text-sm">
                    <dt className="text-muted-foreground">Kwota</dt>
                    <dd className="font-semibold">{totalPLN.toFixed(2)} zł</dd>
                  </div>
                )}

                {(isEvent ? first?.reservationNumber : docs.find((d: any) => d.reservationNumber)?.reservationNumber) && (
                  <div className="flex justify-between text-sm">
                    <dt className="text-muted-foreground">Numer rezerwacji</dt>
                    <dd className="font-mono text-xs font-semibold">
                      {isEvent
                        ? String(first?.reservationNumber ?? "")
                        : String(docs.find((d: any) => d.reservationNumber)?.reservationNumber ?? "")}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {isPending && (
              <p className="mb-6 text-sm text-muted-foreground">
                Status płatności zaktualizuje się automatycznie po potwierdzeniu przez Przelewy24.
                Potwierdzenie zostanie wysłane e-mailem.
              </p>
            )}
          </>
        ) : (
          <p className="mb-8 text-muted-foreground">
            Rezerwacja przyjęta. Potwierdzenie zostanie wysłane na podany adres e-mail.
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link href="/">Strona główna</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/rezerwacje">Rezerwacje</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
