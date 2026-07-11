"use client";


import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { ReservationRules } from "@/components/reservations/ReservationRules";
import { CustomerFields } from "@/components/reservations/CustomerFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { WeekDateCards } from "@/components/reservations/WeekDateCards";
import { ReservationStepper } from "@/components/reservations/ReservationStepper";
import { AcceptRulesCard } from "@/components/reservations/AcceptRulesCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";

import { tablesRequestSchema, type TablesRequest } from "@/lib/validation/reservations";
import { ServerErrorMessage } from "@/components/reservations/ServerErrorMessage";

type AvailabilitySlot = { time: string; remaining: number; canBook: boolean };
type AvailabilityResponse = {
  ok: boolean;
  enabled: boolean;
  disabledMessage?: string | null;
  availableTablesCount: number;
  slots: AvailabilitySlot[];
};

function InfoPopover({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Informacja o limicie osób"
        aria-expanded={open ? "true" : "false"}
        className="inline-flex text-muted-foreground hover:text-foreground focus-visible:text-foreground outline-none transition-colors"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-1.5 w-60 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2.5 text-xs leading-relaxed text-popover-foreground shadow-md"
        >
          {message}
        </div>
      )}
    </div>
  );
}

function clampPartySizeUI(raw: string) {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  const normalized = digitsOnly.replace(/^0+(?=\d)/, "");
  if (normalized === "") return "";
  let n = Number(normalized);
  if (!Number.isFinite(n)) return "";
  if (n < 1) n = 1;
  if (n > 16) n = 16;
  return String(n);
}

export default function RezerwacjeStolikiPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [day, setDay] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  });

  const [hour, setHour] = useState<string>("18:00");
  const [partySizeRaw, setPartySizeRaw] = useState<string>("2");

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const partySizeNumber = useMemo(() => {
    if (partySizeRaw.trim() === "") return 0;
    const n = Number(partySizeRaw);
    return Number.isFinite(n) ? n : 0;
  }, [partySizeRaw]);

  const partySizeForApi = useMemo(() => {
    const n = Math.max(1, partySizeNumber || 1);
    return Math.min(16, n);
  }, [partySizeNumber]);

  const selectedSlot = useMemo(() => {
    return availability?.slots?.find((s) => s.time === hour) ?? null;
  }, [availability, hour]);

  const isReservationsEnabled = availability?.enabled ?? true;
  const disabledMessage =
    availability?.disabledMessage ?? "Rezerwacje stolików są obecnie wyłączone. Prosimy spróbować później.";

  const remainingNow = selectedSlot?.remaining ?? 0;

  const canGoStep2 = useMemo(() => {
    if (!isReservationsEnabled) return false;
    if (!day || !hour) return false;
    if (partySizeNumber < 1) return false;
    if (!selectedSlot?.canBook) return false;
    return true;
  }, [isReservationsEnabled, day, hour, partySizeNumber, selectedSlot]);

  const form = useForm<TablesRequest>({
    resolver: zodResolver(tablesRequestSchema),
    defaultValues: {
      type: "stolik",
      date: day,
      hour,
      partySize: partySizeForApi,
      tablesCount: 1,
      deposit: 0,

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

  useEffect(() => {
    form.setValue("date", day);
    form.setValue("hour", hour);
    form.setValue("partySize", partySizeForApi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, hour, partySizeForApi]);

  async function reloadAvailability(nextDay = day, nextParty = partySizeForApi, currentHour = hour) {
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/reservations/stoliki?date=${encodeURIComponent(nextDay)}&partySize=${nextParty}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as AvailabilityResponse | null;

      if (!res.ok || !json?.ok) {
        setAvailability({
          ok: true,
          enabled: true,
          disabledMessage: null,
          availableTablesCount: 0,
          slots: [],
        });
        return;
      }

      setAvailability(json);

      const exists = json.slots?.some((s) => s.time === currentHour);
      if (!exists) {
        const firstOk = json.slots?.find((s) => s.canBook);
        if (firstOk) setHour(firstOk.time);
        else if (json.slots?.[0]) setHour(json.slots[0].time);
      }
    } finally {
      setLoadingSlots(false);
      setFetchedOnce(true);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await reloadAvailability(day, partySizeForApi, hour);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, partySizeForApi]);

  async function onSubmit(values: TablesRequest) {
    setServerError(null);
    try {
      const res = await fetch("/api/reservations/stoliki", {
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
        setServerError(json?.message ?? "Wystąpił błąd. Spróbuj ponownie.");
        return;
      }

      const groupId = json?.groupId ?? "";
      router.push(`/rezerwacje/podziekowanie?sessionId=${encodeURIComponent(groupId)}`);
    } catch {
      setServerError("Błąd połączenia. Sprawdź internet i spróbuj ponownie.");
    }
  }

  // gating: ukrywamy tylko “resztę” (godzina+osoby+podsumowanie+przycisk)
  const isGatedLoading = !fetchedOnce || loadingSlots;
  const gatedCanGoStep2 = !isGatedLoading && canGoStep2;

  return (
    <div className="grid gap-6">
      <ReservationStepper step={step} />

      <ReservationRules title="Zasady rezerwacji stolików">
        <p>Rezerwacje odbywają się na zasadach określonych w Regulaminie obiektu.</p>
        <p>
          <a
            href="/regulamin"
            target="_blank"
            rel="noreferrer"
            className="underline transition-colors hover:text-foreground"
          >
            Zobacz regulamin
          </a>
        </p>
      </ReservationRules>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Wybór terminu</CardTitle>
          </CardHeader>

          <CardContent className="grid gap-5">
            {/* ✅ TO MA BYĆ ZAWSZE WIDOCZNE (bez gatingu) */}
            <div className="grid gap-2">
              <Label>Dzień (tydzień do przodu)</Label>
              <WeekDateCards value={day} onChange={setDay} />
            </div>

            {/* ✅ tutaj dopiero gating + overlay, bez layout shiftu */}
            <div className="relative min-h-[200px]">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: isGatedLoading ? 0 : 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                style={{ pointerEvents: isGatedLoading ? "none" : "auto" }}
                className="grid gap-5"
              >
                <div className="grid gap-2 max-w-[360px]">
                  <Label>Godzina (co 15 minut)</Label>
                  <Select value={hour} onValueChange={setHour} disabled={loadingSlots || !isReservationsEnabled}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingSlots ? "Ładuję..." : "Wybierz godzinę"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(availability?.slots ?? []).length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          Brak dostępnych godzin
                        </SelectItem>
                      ) : (
                        availability!.slots.map((s) => (
                          <SelectItem key={s.time} value={s.time} disabled={!s.canBook}>
                            {s.time}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>

                  <div className="text-sm text-muted-foreground min-h-[1.25rem]">
                    {selectedSlot ? <>Dostępne miejsca: <span className="font-medium">{remainingNow}</span></> : null}
                  </div>
                </div>

                <div className="grid gap-2 max-w-[360px]">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="partySize">Liczba osób (max 16)</Label>
                    <InfoPopover message="Rezerwacja stolika online możliwa jest dla maksymalnie 16 osób. W przypadku większych grup prosimy o kontakt z obsługą." />
                  </div>
                  <Input
                    id="partySize"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={partySizeRaw}
                    onChange={(e) => setPartySizeRaw(clampPartySizeUI(e.target.value))}
                    onBlur={() => {
                      if (partySizeRaw.trim() === "") setPartySizeRaw("1");
                      else setPartySizeRaw(clampPartySizeUI(partySizeRaw) || "1");
                    }}
                  />
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    type="button"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!gatedCanGoStep2}
                    onClick={() => setStep(2)}
                  >
                    Podaj dane
                  </Button>
                  {fetchedOnce && !isReservationsEnabled ? (
                    <span className="text-sm text-muted-foreground">{disabledMessage}</span>
                  ) : null}
                </div>
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
                      <div className="text-sm text-muted-foreground">Ładowanie dostępności…</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <form className="grid gap-6" onSubmit={form.handleSubmit(onSubmit)}>
          <input type="hidden" {...form.register("date")} />
          <input type="hidden" {...form.register("hour")} />
          <input type="hidden" {...form.register("partySize", { valueAsNumber: true })} />
          <input type="hidden" {...form.register("tablesCount", { valueAsNumber: true })} />
          <input type="hidden" {...form.register("deposit", { valueAsNumber: true })} />

          <Card>
            <CardHeader>
              <CardTitle>Twoje dane</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-6">
              <div className="rounded-xl border p-4 grid gap-3">
                <p className="text-sm text-muted-foreground">Podsumowanie</p>
                <div>
                  <p className="font-semibold">Stoliki</p>
                  <div className="mt-1.5 grid gap-0.5 text-sm">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Data</span>
                      <span className="font-medium">{day.split("-").reverse().join(".")}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Godzina</span>
                      <span className="font-medium">{hour}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Liczba osób</span>
                      <span className="font-medium">{Math.min(16, Math.max(1, partySizeNumber || 1))}</span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground border-t pt-3">
                  Rezerwacja stolika nie wymaga płatności online.
                </p>
              </div>

              <CustomerFields register={form.register} errors={form.formState.errors} />

              {/* <Card>
                <CardHeader>
                  <CardTitle>Faktura</CardTitle>
                </CardHeader>
                <CardContent>
                  <InvoiceFields control={form.control as any} trigger={form.trigger as any} errors={form.formState.errors as any} />
                </CardContent>
              </Card> */}

              <AcceptRulesCard control={form.control as any} trigger={form.trigger as any} errors={form.formState.errors as any} />
              <AcceptRulesCard
                control={form.control as any}
                trigger={form.trigger as any}
                errors={form.formState.errors as any}
                name="acceptPrivacyPolicy"
                idPrefix="acceptPrivacyPolicy"
                label="Akceptuję politykę prywatności"
                href="/polityka-prywatnosci"
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Wróć
                </Button>

                <Button
                  type="submit"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={form.formState.isSubmitting}
                  onClick={() => form.trigger()}
                >
                  {form.formState.isSubmitting ? "Przetwarzam..." : "Zarezerwuj stolik"}
                </Button>
              </div>

              {serverError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  <ServerErrorMessage message={serverError} />
                </div>
              ) : null}
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
            <p className="text-muted-foreground">Rezerwacja została wysłana.</p>

            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={async () => {
                setStep(1);
                await reloadAvailability(day, partySizeForApi, hour);
              }}
            >
              Zrób kolejną rezerwację
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
