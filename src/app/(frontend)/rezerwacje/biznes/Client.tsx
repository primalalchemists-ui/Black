"use client";


import { useEffect, useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ReservationRules } from "@/components/reservations/ReservationRules";
import { CustomerFields } from "@/components/reservations/CustomerFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceFields } from "@/components/reservations/InvoiceFields";
import { ReservationStepper } from "@/components/reservations/ReservationStepper";
import { AcceptRulesCard } from "@/components/reservations/AcceptRulesCard";
import { ErrorSlot } from "@/components/forms/ErrorSlot";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { businessRequestSchema, type BusinessRequest } from "@/lib/validation/reservations";
import { fetchEventsByKind, getEventDisplayDateTimePL, renderPricePLN, type CmsEvent } from "@/lib/cms/events";

type EventItem = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  priceLabel: string | null;
  capacityLabel: string | null;
};

function mapBusinessEventToItem(e: CmsEvent): EventItem {
  const dt = getEventDisplayDateTimePL(e);
  return {
    id: String(e.id),
    title: e.title,
    dateLabel: dt?.date ?? "—",
    timeLabel: dt?.time ?? "—",
    priceLabel: renderPricePLN(e.pricePLN),
    capacityLabel: typeof e.capacity === "number" ? String(e.capacity) : null,
  };
}

function parseCapacity(capacityLabel: string | null): number | null {
  if (capacityLabel == null) return null;
  const n = Number(capacityLabel);
  return Number.isFinite(n) ? n : null;
}

export default function RezerwacjeBiznesPage() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [eventId, setEventId] = useState<string>("");

  const event = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId]);

  const capacityNum = useMemo(() => parseCapacity(event?.capacityLabel ?? null), [event?.capacityLabel]);
  const isSoldOut = capacityNum !== null && capacityNum <= 0;

  const form = useForm<BusinessRequest>({
    resolver: zodResolver(businessRequestSchema),
    defaultValues: {
      type: "biznes",
      eventId: "",

      disabledPerson: false,
      disabilityDetails: "",

      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      notes: "",

      wantInvoice: false,
      nip: "",

      acceptRules: false,
      acceptPrivacyPolicy: false,
    },
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const cmsEvents = await fetchEventsByKind("business");
      const fetched = cmsEvents.map(mapBusinessEventToItem);
      setEvents(fetched);
      return fetched;
    } finally {
      setLoadingEvents(false);
      setFetchedOnce(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      const fetched = await loadEvents();
      if (!alive) return;

      if (!fetched.length) {
        setEventId("");
        return;
      }

      const urlId = searchParams.get("eventId");
      const storageId = (() => {
        try {
          return sessionStorage.getItem("biznes:eventId");
        } catch {
          return null;
        }
      })();

      const preferred = urlId || storageId;
      const preferredExists = preferred ? fetched.some((e) => e.id === preferred) : false;

      const firstWithSeats = fetched.find((e) => {
        const c = parseCapacity(e.capacityLabel);
        return c === null ? true : c > 0;
      });

      setEventId(preferredExists ? (preferred as string) : (firstWithSeats?.id ?? fetched[0]!.id));
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!eventId) return;

    form.setValue("eventId", eventId, { shouldValidate: step === 2 });

    try {
      sessionStorage.setItem("biznes:eventId", eventId);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function onSubmit(values: BusinessRequest) {
    if (isSoldOut) {
      form.setError("eventId" as any, { type: "server", message: "Koniec miejsc na to wydarzenie." });
      return;
    }

    const res = await fetch("/api/reservations/biznes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      console.log("BIZNES API ERROR:", err);

      if (err?.error === "VALIDATION_ERROR" && Array.isArray(err.issues)) {
        for (const issue of err.issues) {
          const path = issue.path?.[0];
          if (path) form.setError(path as any, { type: "server", message: issue.message });
        }
        return;
      }

      if (err?.error === "NO_AVAILABILITY") {
        form.setError("eventId" as any, { type: "server", message: "Koniec miejsc na to wydarzenie." });
        await loadEvents();
        return;
      }

      alert(err?.message ?? "Wystąpił błąd. Spróbuj ponownie.");
      return;
    }

    const refreshed = await loadEvents();

    const current = refreshed.find((e) => e.id === eventId) ?? null;
    const currentCap = parseCapacity(current?.capacityLabel ?? null);
    if (current && currentCap !== null && currentCap <= 0) {
      const firstWithSeats = refreshed.find((e) => {
        const c = parseCapacity(e.capacityLabel);
        return c === null ? true : c > 0;
      });
      if (firstWithSeats) setEventId(firstWithSeats.id);
    }

    setStep(3);
  }

  const disabledPerson = Boolean(form.watch("disabledPerson"));
  const hasBusinessEvents = events.length > 0;

  const isGatedLoading = !fetchedOnce || loadingEvents;

  return (
    <div className="grid gap-6">
      <ReservationStepper step={step} />

      <ReservationRules title="Zapisy na wydarzenia biznesowe">
        <p>Płatność na miejscu.</p>
        <p>Limit miejsc zależy od wydarzenia.</p>
      </ReservationRules>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Wydarzenie</CardTitle>
          </CardHeader>

          <CardContent className="relative min-h-[364px]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isGatedLoading ? 0 : 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{ pointerEvents: isGatedLoading ? "none" : "auto" }}
              className="grid gap-4"
            >
              {!hasBusinessEvents ? (
                <div className="text-sm text-muted-foreground" role="status" aria-live="polite">
                  Brak wydarzeń biznesowych.
                </div>
              ) : (
                <>
                  <div className="grid gap-2 max-w-[520px]">
                    <Label htmlFor="eventSelect">Wybierz wydarzenie</Label>
                    <Select value={eventId} onValueChange={setEventId}>
                      <SelectTrigger id="eventSelect" aria-label="Wybierz wydarzenie biznesowe">
                        <SelectValue placeholder="Wybierz wydarzenie" />
                      </SelectTrigger>
                      <SelectContent>
                        {events.map((e) => {
                          const cap = parseCapacity(e.capacityLabel);
                          const soldOut = cap !== null && cap <= 0;

                          return (
                            <SelectItem key={e.id} value={e.id} disabled={soldOut}>
                              {e.title}
                              {soldOut ? " — KONIEC MIEJSC" : null}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {event ? (
                    <div className="rounded-lg border p-4" aria-label="Szczegóły wydarzenia">
                      <div className="text-sm text-muted-foreground">Szczegóły</div>
                      <div className="grid gap-1">
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted-foreground">
                          Data: {event.dateLabel}, {event.timeLabel}
                        </div>

                        {event.priceLabel ? (
                          <div className="text-sm font-medium">
                            Cena: {event.priceLabel} <span className="text-muted-foreground">(płatność na miejscu)</span>
                          </div>
                        ) : null}

                        {event.capacityLabel ? (
                          <div className="text-sm text-muted-foreground">
                            Limit miejsc: {event.capacityLabel}{" "}
                            {isSoldOut ? <span className="font-medium text-destructive">— KONIEC MIEJSC</span> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    className="bg-black text-white hover:bg-black/90"
                    disabled={!eventId || isSoldOut}
                    onClick={() => {
                      if (!eventId || isSoldOut) return;
                      form.setValue("eventId", eventId, { shouldValidate: true });
                      setStep(2);
                    }}
                  >
                    {isSoldOut ? "Koniec miejsc" : "Podaj dane"}
                  </Button>
                </>
              )}
            </motion.div>

            <AnimatePresence>
              {isGatedLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="absolute inset-0 grid place-items-center bg-card/80 backdrop-blur-sm"
                >
                  <div className="grid place-items-center gap-3">
                    <div className="h-16 w-16 animate-spin rounded-full border-4 border-black/20 border-t-black" />
                    <div className="text-sm text-muted-foreground">Ładowanie wydarzeń…</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <form className="grid gap-6" onSubmit={form.handleSubmit(onSubmit)} aria-label="Formularz zapisu na wydarzenie biznesowe">
          <Card>
            <CardHeader>
              <CardTitle>Twoje dane</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-6">
              <div className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">Podsumowanie</div>

                {event ? (
                  <>
                    <div className="font-medium">
                      {event.title} • {event.dateLabel} • {event.timeLabel}
                    </div>
                    <div className="text-sm text-muted-foreground">Płatność na miejscu</div>
                    {event.priceLabel ? <div className="text-sm font-medium">Cena: {event.priceLabel}</div> : null}
                    {event.capacityLabel ? (
                      <div className="text-sm text-muted-foreground">
                        Limit miejsc: {event.capacityLabel}{" "}
                        {isSoldOut ? <span className="font-medium text-destructive">— KONIEC MIEJSC</span> : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Brak wybranego wydarzenia.</div>
                )}
              </div>

              {isSoldOut ? (
                <div className="rounded-lg border p-4 text-sm">
                  <span className="font-medium text-destructive">Koniec miejsc.</span> Wróć i wybierz inne wydarzenie.
                </div>
              ) : null}

              <fieldset className="grid gap-4" aria-labelledby="accessibilitySection">
                <legend id="accessibilitySection" className="text-sm font-medium">
                  Dostępność
                </legend>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="disabledPerson"
                    checked={disabledPerson}
                    onCheckedChange={(v) => form.setValue("disabledPerson", Boolean(v), { shouldValidate: true })}
                    aria-labelledby="disabledPersonLabel"
                    aria-describedby="disabledPersonHelp"
                  />
                  <div className="grid gap-1 leading-none">
                    {/* zamiast Label htmlFor */}
                    <span id="disabledPersonLabel" className="text-sm font-medium leading-none">
                      Jestem osobą niepełnosprawną
                    </span>

                    <p id="disabledPersonHelp" className="text-sm text-muted-foreground">
                      Jeśli zaznaczysz, opisz problem poniżej.
                    </p>
                  </div>
                </div>

                {disabledPerson ? (
                  <div className="grid gap-2">
                    <Label htmlFor="disabilityDetails">Opisz problem</Label>
                    <Textarea
                      id="disabilityDetails"
                      className="min-h-[120px]"
                      placeholder="Np. dostęp, miejsce, wsparcie obsługi..."
                      value={String(form.watch("disabilityDetails") ?? "")}
                      onChange={(e) => form.setValue("disabilityDetails", e.target.value, { shouldValidate: true })}
                      onBlur={() => form.trigger("disabilityDetails")}
                    />
                    <ErrorSlot message={form.formState.errors?.disabilityDetails?.message as any} />
                  </div>
                ) : (
                  <ErrorSlot message={undefined} />
                )}
              </fieldset>


              <CustomerFields register={form.register} errors={form.formState.errors} />

              <Card>
                <CardHeader>
                  <CardTitle>Faktura</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceFields control={form.control as any} trigger={form.trigger as any} errors={form.formState.errors as any} />
                </CardContent>
              </Card>

              <AcceptRulesCard control={form.control as any} trigger={form.trigger as any} errors={form.formState.errors as any} />
              <AcceptRulesCard
                control={form.control as any}
                trigger={form.trigger as any}
                errors={form.formState.errors as any}
                name="acceptPrivacyPolicy"
                idPrefix="acceptPrivacyPolicy"
                label="Akceptuję politykę prywatności"
                href="/api/privacy-policy"
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Wróć
                </Button>

                <Button
                  type="submit"
                  className="bg-black text-white hover:bg-black/90"
                  disabled={form.formState.isSubmitting || !eventId || isSoldOut}
                  onClick={async () => {
                    await form.trigger();
                  }}
                >
                  {isSoldOut ? "Koniec miejsc" : form.formState.isSubmitting ? "Wysyłam..." : "Wyślij zapis"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Gotowe!</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="text-muted-foreground" role="status" aria-live="polite">
              Zgłoszenie zostało wysłane.
            </p>
            <Button
              className="bg-black text-white hover:bg-black/90"
              onClick={async () => {
                await loadEvents();
                setStep(1);
              }}
            >
              Zapisz się na kolejne
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
