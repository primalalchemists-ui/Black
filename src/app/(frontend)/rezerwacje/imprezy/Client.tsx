"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CustomerFields } from "@/components/reservations/CustomerFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvoiceFields } from "@/components/reservations/InvoiceFields";
import { ReservationStepper } from "@/components/reservations/ReservationStepper";
import { AcceptRulesCard } from "@/components/reservations/AcceptRulesCard";
import { ErrorSlot } from "@/components/forms/ErrorSlot";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";
import { ServerErrorMessage } from "@/components/reservations/ServerErrorMessage";

import { imprezaRequestSchema, type ImprezaRequest } from "@/lib/validation/reservations";
import { fetchEventsByKind, getEventDisplayDateTimePL, renderPricePLN, type CmsEvent } from "@/lib/cms/events";
import { formatPLN } from "@/components/reservations/money";

type EventItem = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  priceLabel: string | null;
  pricePLN: number | null;
  capacityLabel: string | null;
  takenSeats: number | null;
};

function mapImprezaEventToItem(e: CmsEvent): EventItem {
  const dt = getEventDisplayDateTimePL(e);
  return {
    id: String(e.id),
    title: e.title,
    dateLabel: dt?.date ?? "—",
    timeLabel: dt?.time ?? "—",
    priceLabel: renderPricePLN(e.pricePLN),
    pricePLN: typeof e.pricePLN === "number" ? e.pricePLN : null,
    capacityLabel: typeof e.capacity === "number" ? String(e.capacity) : null,
    takenSeats: typeof e.takenSeats === "number" ? e.takenSeats : null,
  };
}

function parseCapacity(label: string | null): number | null {
  if (label == null) return null;
  const n = Number(label);
  return Number.isFinite(n) ? n : null;
}

interface Props {
  initialEventId?: string;
}

export default function ImprezaClient({ initialEventId }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [eventId, setEventId] = useState<string>(initialEventId ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  const event = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId]);
  const capacityNum = useMemo(() => parseCapacity(event?.capacityLabel ?? null), [event]);
  const spotsLeft = useMemo(() => {
    if (capacityNum === null) return null;
    const taken = event?.takenSeats ?? null;
    if (taken === null) return null;
    return Math.max(0, capacityNum - taken);
  }, [capacityNum, event]);
  const isSoldOut = spotsLeft !== null && spotsLeft <= 0;

  const form = useForm<ImprezaRequest>({
    resolver: zodResolver(imprezaRequestSchema),
    defaultValues: {
      type: "impreza",
      eventId: initialEventId ?? "",
      partySize: 1,
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      notes: "",
      wantInvoice: false,
      invoiceType: "" as "" | "personal" | "company",
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
      const cmsEvents = await fetchEventsByKind("impreza");
      const fetched = cmsEvents.map(mapImprezaEventToItem);
      setEvents(fetched);
      return fetched;
    } catch {
      return [];
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

      if (initialEventId && fetched.some((e) => e.id === initialEventId)) {
        setEventId(initialEventId);
        return;
      }

      const storageId = (() => {
        try {
          return sessionStorage.getItem("impreza:eventId");
        } catch {
          return null;
        }
      })();

      const preferredExists = storageId ? fetched.some((e) => e.id === storageId) : false;

      const firstWithSeats = fetched.find((e) => {
        const cap = parseCapacity(e.capacityLabel);
        if (cap === null) return true;
        const left = e.takenSeats != null ? Math.max(0, cap - e.takenSeats) : cap;
        return left > 0;
      });

      setEventId(preferredExists ? (storageId as string) : (firstWithSeats?.id ?? fetched[0]!.id));
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
      sessionStorage.setItem("impreza:eventId", eventId);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function onSubmit(values: ImprezaRequest) {
    setServerError(null);

    if (isSoldOut) {
      form.setError("eventId" as any, { type: "server", message: "Koniec miejsc na to wydarzenie." });
      return;
    }

    try {
      const res = await fetch("/api/reservations/impreza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        if (json?.error === "VALIDATION_ERROR" && Array.isArray(json.issues)) {
          for (const issue of json.issues) {
            const path = issue.path?.[0];
            if (path) form.setError(path as any, { type: "server", message: issue.message });
          }
          return;
        }

        if (json?.error === "NO_AVAILABILITY") {
          setServerError(json?.message ?? "Brak dostępności na to wydarzenie.");
          await loadEvents();
          return;
        }

        setServerError(json?.message ?? "Wystąpił błąd. Spróbuj ponownie.");
        return;
      }

      if (json?.redirectUrl) {
        window.location.href = String(json.redirectUrl);
        return;
      }

      const groupId = json?.groupId ?? "";
      router.push(`/rezerwacje/podziekowanie?sessionId=${encodeURIComponent(groupId)}`);
    } catch {
      setServerError("Błąd połączenia. Sprawdź internet i spróbuj ponownie.");
    }
  }

  const watchedPartySize = form.watch("partySize");
  const totalPLN = (event?.pricePLN ?? 0) * Math.max(1, watchedPartySize || 1);

  const maxPartySize = spotsLeft ?? capacityNum ?? 999;
  const { ref: partySizeRef, name: partySizeName, onChange: partySizeChange, onBlur: partySizeBlur } = form.register("partySize", { valueAsNumber: true });

  const isGatedLoading = !fetchedOnce || loadingEvents;
  const hasEvents = events.length > 0;

  return (
    <div className="grid gap-6">
      <ReservationStepper step={step} />

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Wybierz imprezę</CardTitle>
          </CardHeader>

          <CardContent className="relative min-h-[320px]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: isGatedLoading ? 0 : 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              style={{ pointerEvents: isGatedLoading ? "none" : "auto" }}
              className="grid gap-4 max-w-[520px] mx-auto"
            >
              {!hasEvents ? (
                <div
                  className="flex flex-col items-center justify-center py-12 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <CalendarDays aria-hidden="true" className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="font-medium text-foreground">Brak nadchodzących imprez</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Sprawdź ponownie wkrótce lub skontaktuj się z obsługą.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Select value={eventId} onValueChange={setEventId}>
                      <SelectTrigger id="eventSelect" aria-label="Wybierz imprezę">
                        <SelectValue placeholder="Wybierz imprezę" />
                      </SelectTrigger>
                      <SelectContent>
                        {events.map((e) => {
                          const cap = parseCapacity(e.capacityLabel);
                          const taken = e.takenSeats ?? null;
                          const left = cap !== null && taken !== null ? Math.max(0, cap - taken) : null;
                          const soldOut = left !== null && left <= 0;
                          return (
                            <SelectItem key={e.id} value={e.id} disabled={soldOut}>
                              {e.title}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="rounded-lg border p-4 min-h-[80px]" aria-label="Szczegóły imprezy">
                    <div className="text-sm text-muted-foreground">Szczegóły</div>
                    {event ? (
                      <div className="grid gap-1">
                        <div className="font-medium">{event.title}</div>
                        <div className="text-sm text-muted-foreground">
                          Data: {event.dateLabel}, {event.timeLabel}
                        </div>
                        {event.priceLabel ? (
                          <div className="text-sm font-medium">
                            Cena / os.: {event.priceLabel}{" "}
                            {(event.pricePLN ?? 0) > 0 ? (
                              <span className="text-muted-foreground">(płatność online)</span>
                            ) : null}
                          </div>
                        ) : null}
                        {event.capacityLabel ? (
                          <div className="text-sm text-muted-foreground">
                            {isSoldOut ? (
                              <span className="font-medium text-destructive">Brak wolnych miejsc</span>
                            ) : spotsLeft !== null ? (
                              <>Pozostało: <span className="font-medium text-foreground">{spotsLeft}</span> miejsc</>
                            ) : (
                              <>Limit: {event.capacityLabel} miejsc</>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    type="button"
                    className="w-full bg-black text-white hover:bg-black/90"
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
                    <div className="text-sm text-muted-foreground">Ładowanie imprez…</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <form
          className="grid gap-6"
          onSubmit={form.handleSubmit(onSubmit)}
          aria-label="Formularz zapisu na imprezę"
        >
          <Card>
            <CardHeader>
              <CardTitle>Twoje dane</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-6">
              <div className="grid gap-3">
                <div className="grid gap-2 max-w-[200px]">
                  {spotsLeft !== null && !isSoldOut ? (
                    <p className="text-xs text-muted-foreground">
                      Pozostało: <span className="font-medium text-foreground">{spotsLeft}</span> miejsc
                    </p>
                  ) : null}
                  <Label htmlFor="partySize">Liczba osób</Label>
                  <Input
                    id="partySize"
                    ref={partySizeRef}
                    name={partySizeName}
                    type="number"
                    min={1}
                    max={maxPartySize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > maxPartySize) e.target.value = String(maxPartySize);
                      else if (!isNaN(val) && val < 1) e.target.value = "1";
                      partySizeChange(e);
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (isNaN(val) || val < 1) e.target.value = "1";
                      else if (val > maxPartySize) e.target.value = String(maxPartySize);
                      partySizeBlur(e);
                    }}
                    aria-describedby="partySizeError"
                  />
                  <div id="partySizeError">
                    <ErrorSlot message={form.formState.errors.partySize?.message as string | undefined} />
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="text-sm text-muted-foreground">Podsumowanie</div>
                  {event ? (
                    <>
                      <div className="font-medium">
                        {event.title} &bull; {event.dateLabel} &bull; {event.timeLabel}
                      </div>
                      {event.priceLabel ? (
                        <div className="text-sm font-medium">
                          Cena / os.: {event.priceLabel}{" "}
                          {(event.pricePLN ?? 0) > 0 ? (
                            <span className="text-muted-foreground">(płatność online)</span>
                          ) : (
                            <span className="text-muted-foreground">(płatność na miejscu)</span>
                          )}
                        </div>
                      ) : null}
                      {(event.pricePLN ?? 0) > 0 ? (
                        <div className="mt-1 text-sm font-semibold">
                          Do zapłaty: {formatPLN(totalPLN)}
                        </div>
                      ) : null}
                      {isSoldOut ? (
                        <div className="font-medium text-destructive text-sm">— KONIEC MIEJSC</div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Brak wybranej imprezy.</div>
                  )}
                </div>
              </div>

              <CustomerFields register={form.register} errors={form.formState.errors} />

              <Card>
                <CardHeader>
                  <CardTitle>Faktura</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceFields
                    control={form.control as any}
                    trigger={form.trigger as any}
                    errors={form.formState.errors as any}
                  />
                </CardContent>
              </Card>

              <AcceptRulesCard
                control={form.control as any}
                trigger={form.trigger as any}
                errors={form.formState.errors as any}
              />
              <AcceptRulesCard
                control={form.control as any}
                trigger={form.trigger as any}
                errors={form.formState.errors as any}
                name="acceptPrivacyPolicy"
                idPrefix="acceptPrivacyPolicy"
                label="Akceptuję politykę prywatności"
                href="/polityka-prywatnosci"
              />

              {serverError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <ServerErrorMessage message={serverError} />
                </div>
              ) : null}

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
                  {isSoldOut
                    ? "Koniec miejsc"
                    : form.formState.isSubmitting
                      ? "Przetwarzam..."
                      : (event?.pricePLN ?? 0) > 0
                        ? `Rezerwuję i płacę ${formatPLN(totalPLN)}`
                        : "Wyślij zapis"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
