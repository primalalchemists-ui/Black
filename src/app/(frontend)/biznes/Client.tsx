"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import type { CarouselApi } from "@/components/ui/carousel"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CalendarDays, CalendarCheck, Banknote, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ErrorSlot } from "@/components/forms/ErrorSlot"

import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import DotNav from "@/components/home/components/DotNav"

import { CustomerFields } from "@/components/reservations/CustomerFields"
import { CompanyNipFields } from "@/components/reservations/CompanyNipFields"

import { occasionalInquirySchema, type OccasionalInquiry } from "@/lib/validation/occasionalInquiry"
import { FadeInImage } from "@/components/ui/FadeInImage"
import { AcceptRulesCard } from "@/components/reservations/AcceptRulesCard"

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
        {!e.imageUrl && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent"
          />
        )}
      </div>

      <div className="grid gap-1">
        <p className="font-semibold">{e.title}</p>

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
            <span className="text-muted-foreground">
              {priceLabel !== "Darmowe" ? "(płatność na miejscu)" : ""}
            </span>
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
          className="md:self-start"
          onClick={() => onSignup(String(e.id))}
        >
          Zapisz się
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
    acceptPrivacyPolicy: false,
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
  const eventsTitle = loadingEvents ? "Wydarzenia" : events.length <= 1 ? "Wydarzenie" : "Wydarzenia"

  return (
    <div className="grid gap-8 px-4 py-4 md:px-0">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Biznes & Eventy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Konferencje, szkolenia, integracje firmowe i więcej.
        </p>
      </div>

      {/* Rules strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-5 py-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          Zapisy na wydarzenia biznesowe
        </span>
        <span className="flex items-center gap-1.5">
          <Banknote aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          Płatność na miejscu
        </span>
        <span className="flex items-center gap-1.5">
          <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          Limit miejsc zależy od wydarzenia
        </span>
      </div>

      {/* Events section */}
      <div className="grid gap-4">
        <div className="flex items-center gap-4">
          <h2 className="whitespace-nowrap text-xl font-bold tracking-tight">{eventsTitle}</h2>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          <AnimatePresence mode="wait" initial={false}>
            {loadingEvents ? (
              <MotionWrap k="biz-events-loading" className="p-6">
                <div role="status" aria-live="polite">
                  <EventsSkeleton />
                </div>
              </MotionWrap>
            ) : !events.length ? (
              <MotionWrap
                k="biz-events-empty"
                className="flex flex-col items-center justify-center px-6 py-12 text-center"
              >
                <CalendarDays aria-hidden="true" className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-foreground" role="status" aria-live="polite">
                  Brak nadchodzących wydarzeń
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sprawdź ponownie wkrótce lub wyślij zapytanie poniżej.
                </p>
              </MotionWrap>
            ) : events.length === 1 ? (
              <MotionWrap k="biz-events-single" className="p-6">
                <EventSlide e={events[0]!} onSignup={handleSignupClick} showSignupButton={hasBusinessEvents} />
              </MotionWrap>
            ) : (
              <MotionWrap k="biz-events-carousel" className="p-6">
                <div className="relative w-full overflow-hidden">
                  <Carousel
                    aria-label="Karuzela wydarzeń biznesowych"
                    opts={{ align: "start", loop: true, containScroll: "trimSnaps", slidesToScroll: 1 }}
                    setApi={setApi as any}
                    className="w-full overflow-hidden"
                  >
                    <CarouselContent className="-ml-4">
                      {events.map((e) => (
                        <CarouselItem key={String(e.id)} className="pl-4 basis-full">
                          <EventSlide e={e} onSignup={handleSignupClick} showSignupButton={hasBusinessEvents} />
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                  </Carousel>

                  <div className="mt-3 hidden justify-center md:flex">
                    <DotNav api={api} label="Nawigacja karuzeli wydarzeń biznesowych" />
                  </div>
                </div>
              </MotionWrap>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CTA + organizer form */}
      <div
        className="overflow-hidden rounded-2xl border border-[hsl(var(--brand)/0.35)] bg-card"
        ref={signupRef}
      >
        <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold">Chcesz zorganizować event?</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Opisz swoje potrzeby — skontaktujemy się z Tobą.
            </p>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => {
              setSent(false)
              setShowOrganizerForm((v) => !v)
            }}
          >
            {showOrganizerForm ? "Zwiń formularz" : "Wyślij zapytanie"}
          </Button>
        </div>

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
              <div className="border-t px-6 pb-6 pt-5">
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
                      <p className="text-sm text-muted-foreground">
                        Dziękujemy — odezwiemy się najszybciej jak to możliwe.
                      </p>
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

                      <AcceptRulesCard
                        control={form.control as any}
                        trigger={form.trigger as any}
                        errors={form.formState.errors as any}
                        name="acceptPrivacyPolicy"
                        idPrefix="acceptPrivacyPolicy"
                        label="Akceptuję politykę prywatności"
                        href="/api/privacy-policy"
                      />

                      <div className="grid gap-2">
                        <p className="text-sm text-muted-foreground">
                          Podaj jak najwięcej szczegółów, a my skontaktujemy się z Tobą.
                        </p>
                        <Button
                          type="submit"
                          disabled={form.formState.isSubmitting}
                        >
                          {form.formState.isSubmitting ? "Wysyłam..." : "Wyślij zapytanie"}
                        </Button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
