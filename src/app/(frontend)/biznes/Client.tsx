"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import type { CarouselApi } from "@/components/ui/carousel"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import { ReservationRules } from "@/components/reservations/ReservationRules"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ErrorSlot } from "@/components/forms/ErrorSlot"

import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import DotNav from "@/components/home/components/DotNav"

import { CustomerFields } from "@/components/reservations/CustomerFields"
import { CompanyNipFields } from "@/components/reservations/CompanyNipFields"

import { occasionalInquirySchema, type OccasionalInquiry } from "@/lib/validation/occasionalInquiry"
import { FadeInImage } from "@/components/ui/FadeInImage"

type CmsEvent = {
  id: string
  title: string
  description?: string | null
  kind?: "promo" | "business" | "party" | "sport" | null

  day?: string | null
  allDay?: boolean | null
  startHour?: string | number | null
  startMinute?: string | number | null

  capacity?: number | null
  imageUrl?: string | null
  pricePLN?: number | null
}

const FALLBACK_IMG = "/images/icons/black-heart.png"

/** --- Framer Motion: collapse/expand organizer form --- */
const collapseVariants = {
  closed: { height: 0, opacity: 0, y: -6 },
  open: { height: "auto", opacity: 1, y: 0 },
} as const

const collapseTransition = {
  height: { duration: 0.28 },
  opacity: { duration: 0.18, delay: 0.02 },
  y: { duration: 0.18 },
} as const

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function toNumberSafe(v: any, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Bez timezone-krzywdy:
 * - data z `day` jako PL string
 * - czas z `startHour/startMinute`
 * - allDay -> "Całodniowe"
 */
function getDisplayDateTimePL(e: CmsEvent): { date: string; time: string } | null {
  if (!e.day) return null
  const d = new Date(e.day)
  if (!Number.isFinite(d.getTime())) return null

  const date = d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" })
  if (e.allDay) return { date, time: "Całodniowe" }

  const h = toNumberSafe(e.startHour, 0)
  const m = toNumberSafe(e.startMinute, 0)
  return { date, time: `${pad2(h)}:${pad2(m)}` }
}

function renderPrice(pricePLN: number | null | undefined) {
  if (pricePLN == null) return null
  if (pricePLN === 0) return "Darmowe"
  return `${pricePLN} zł`
}

async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function fetchEvents(): Promise<CmsEvent[]> {
  const json: any = await safeFetchJson("/api/cms/events")
  const list: CmsEvent[] = Array.isArray(json?.events) ? json.events : []
  return list
}

function MotionWrap({
  k,
  children,
  className,
}: {
  k: string
  children: React.ReactNode
  className?: string
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
  )
}

/** fixed height -> zero layout shift */
function EventsSkeleton() {
  return (
    <div className="grid gap-3">
      <div className="h-[180px] w-full rounded-lg bg-muted animate-pulse" />
      <div className="hidden md:flex justify-center">
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}

function EventSlide({
  e,
  onSignup,
  showSignupButton,
}: {
  e: CmsEvent
  onSignup: (eventId: string) => void
  showSignupButton: boolean
}) {
  const dt = getDisplayDateTimePL(e)
  const priceLabel = renderPrice(e.pricePLN)
  const capacity = typeof e.capacity === "number" ? e.capacity : null

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr_auto] md:items-start">
      <div className="relative h-48 w-full md:h-44">
        <FadeInImage
          src={e.imageUrl || FALLBACK_IMG}
          alt={e.title}
          className="h-full w-full object-contain"
          loading="lazy"
        />
        {!e.imageUrl && <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
        />}
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
        ) : null}

        {priceLabel ? (
          <p className="text-sm">
            <span className="font-medium">Cena:</span> {priceLabel}{" "}
            <span className="text-muted-foreground">{priceLabel !== "Darmowe" ? "(płatność na miejscu)" : ""}</span>
          </p>
        ) : null}

        {capacity != null ? (
          <p className="text-sm">
            <span className="font-medium">Limit miejsc:</span> {capacity}
          </p>
        ) : null}
      </div>

      {showSignupButton ? (
        <Button
          type="button"
          className="bg-black text-white hover:bg-black/90 md:self-start"
          onClick={() => onSignup(String(e.id))}
        >
          Zapisz się na wydarzenie
        </Button>
      ) : null}
    </div>
  )
}

export default function RezerwacjeBiznesPage() {
  const router = useRouter()

  const [showOrganizerForm, setShowOrganizerForm] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  const [events, setEvents] = React.useState<CmsEvent[]>([])
  const [loadingEvents, setLoadingEvents] = React.useState(true)
  const [api, setApi] = React.useState<CarouselApi | undefined>(undefined)

  const signupRef = React.useRef<HTMLDivElement | null>(null)

  const form = useForm<OccasionalInquiry>({
    resolver: zodResolver(occasionalInquirySchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      isCompany: false,
      nip: "",
      message: "",
    },
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false,
  })

  React.useEffect(() => {
    let alive = true

    ;(async () => {
      try {
        const allEvents = await fetchEvents()
        const filtered = allEvents.filter((e) => e?.kind === "business")
        if (!alive) return
        setEvents(filtered)
      } finally {
        if (!alive) return
        setLoadingEvents(false)
      }
    })()

    return () => {
      alive = false
    }
  }, [])

  async function onSubmit(values: OccasionalInquiry) {
    const res = await fetch("/api/inquiries/occasional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      console.log("INQUIRY API ERROR:", err)
      alert(err?.message ?? "Wystąpił błąd. Spróbuj ponownie.")
      return
    }

    setSent(true)
  }

  function handleSignupClick(eventId: string) {
    try {
      sessionStorage.setItem("biznes:eventId", eventId)
    } catch {}

    router.push(`/rezerwacje/biznes?eventId=${encodeURIComponent(eventId)}`)
  }

  const hasBusinessEvents = events.length > 0

  return (
    <div className="grid gap-6 p-4">
      <ReservationRules title="Zapisy na wydarzenia biznesowe">
        <p>Płatność na miejscu.</p>
        <p>Limit miejsc zależy od wydarzenia.</p>
      </ReservationRules>

      {/* WYDARZENIA BIZNESOWE */}
      <Card>
        <CardHeader>
          <CardTitle>{loadingEvents ? "Wydarzenia" : events.length <= 1 ? "Wydarzenie" : "Wydarzenia"}</CardTitle>
        </CardHeader>

        {/* FIXED min-height -> brak layout shift */}
        <CardContent className="grid gap-4 min-h-[240px]">
          <AnimatePresence mode="wait" initial={false}>
            {loadingEvents ? (
              <MotionWrap k="biz-events-loading">
                <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  <EventsSkeleton />
                </div>
              </MotionWrap>
            ) : !events.length ? (
              <MotionWrap k="biz-events-empty">
                <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Brak nadchodzących wydarzeń biznesowych.
                </div>
              </MotionWrap>
            ) : events.length === 1 ? (
              <MotionWrap k="biz-events-single">
                <EventSlide e={events[0]!} onSignup={handleSignupClick} showSignupButton={hasBusinessEvents} />
              </MotionWrap>
            ) : (
              <MotionWrap k="biz-events-carousel" className="grid gap-3">
                <div className="relative w-full overflow-hidden">
                  <Carousel
                    aria-label="Karuzela wydarzeń biznesowych"
                    opts={{ align: "start", loop: true, containScroll: "trimSnaps", slidesToScroll: 1 }}
                    setApi={setApi as any}
                    className="w-full overflow-hidden"
                  >
                    {/* spacing jak w OfferSection -> stabilnie */}
                    <CarouselContent className="-ml-4">
                      {events.map((e) => (
                        <CarouselItem key={String(e.id)} className="pl-4 basis-full">
                          <EventSlide e={e} onSignup={handleSignupClick} showSignupButton={hasBusinessEvents} />
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                  </Carousel>

                  <div className="hidden justify-center md:flex mt-3">
                    <DotNav api={api} label="Nawigacja karuzeli wydarzeń biznesowych" />
                  </div>
                </div>
              </MotionWrap>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Formularz organizatora */}
      <Card ref={signupRef}>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Chcesz zorganizować event?</CardTitle>

          <Button
            type="button"
            className="bg-black text-white hover:bg-black/90"
            onClick={() => {
              setSent(false)
              setShowOrganizerForm((v) => !v)
            }}
          >
            {showOrganizerForm ? "Zwiń formularz" : "Wyślij zapytanie"}
          </Button>
        </CardHeader>

        {/* ANIMATED COLLAPSE / EXPAND */}
        <AnimatePresence initial={false}>
          {showOrganizerForm ? (
            <motion.div
              key="organizer-form"
              initial="closed"
              animate="open"
              exit="closed"
              variants={collapseVariants}
              transition={collapseTransition}
              style={{ overflow: "hidden" }}
            >
              <CardContent className="grid gap-6">
                {/* Inner swap: sent <-> form */}
                <AnimatePresence mode="wait" initial={false}>
                  {sent ? (
                    <motion.div
                      key="sent"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="grid gap-2"
                    >
                      <p className="font-medium">Wysłane ✅</p>
                      <p className="text-sm text-muted-foreground">Dziękujemy — odezwiemy się najszybciej jak to możliwe.</p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSent(false)
                          form.reset()
                        }}
                      >
                        Wyślij kolejne zapytanie
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.form
                      key="form"
                      className="grid gap-6"
                      onSubmit={form.handleSubmit(onSubmit)}
                      aria-label="Formularz zapytania o organizację eventu"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                    >
                      <CustomerFields register={form.register} errors={form.formState.errors} />

                      <CompanyNipFields
                        control={form.control}
                        trigger={form.trigger}
                        errors={form.formState.errors}
                        companyLabel="Jestem firmą"
                      />

                      <div className="grid gap-2">
                        <Label htmlFor="message">Wiadomość</Label>
                        <Textarea
                          id="message"
                          placeholder="Opisz: termin, liczba osób, typ wydarzenia, budżet, preferencje dot. menu, sprzęt (projektor/mikrofon), układ sali itp."
                          className="min-h-[160px]"
                          value={String(form.watch("message") ?? "")}
                          onChange={(e) => {
                            form.setValue("message", e.target.value, { shouldValidate: true })
                          }}
                          onBlur={() => form.trigger("message")}
                        />
                        <ErrorSlot message={form.formState.errors?.message?.message} />
                      </div>

                      <div className="grid gap-2">
                        <p className="text-sm text-muted-foreground">Podaj jak najwięcej szczegółów, a my skontaktujemy się z Tobą.</p>

                        <Button
                          type="submit"
                          className="bg-black text-white hover:bg-black/90"
                          disabled={form.formState.isSubmitting}
                        >
                          {form.formState.isSubmitting ? "Wysyłam..." : "Wyślij zapytanie"}
                        </Button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </CardContent>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>
    </div>
  )
}
