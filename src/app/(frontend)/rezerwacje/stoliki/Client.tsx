"use client";


import { useEffect, useMemo, useState } from "react";
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
import { InvoiceFields } from "@/components/reservations/InvoiceFields";
import { ReservationStepper } from "@/components/reservations/ReservationStepper";
import { AcceptRulesCard } from "@/components/reservations/AcceptRulesCard";
import { formatPLN } from "@/components/reservations/money";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { tablesRequestSchema, type TablesRequest } from "@/lib/validation/reservations";

type AvailabilitySlot = { time: string; remaining: number; canBook: boolean };
type AvailabilityResponse = {
  ok: boolean;
  enabled: boolean;
  disabledMessage?: string | null;
  availableTablesCount: number;
  tablesNeeded: number;
  slots: AvailabilitySlot[];
};

function clampPartySizeUI(raw: string) {
  const digitsOnly = raw.replace(/[^\d]/g, "");
  const normalized = digitsOnly.replace(/^0+(?=\d)/, "");
  if (normalized === "") return "";
  let n = Number(normalized);
  if (!Number.isFinite(n)) return "";
  if (n < 1) n = 1;
  if (n > 12) n = 12;
  return String(n);
}

export default function RezerwacjeStolikiPage() {
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

  const partySizeNumber = useMemo(() => {
    if (partySizeRaw.trim() === "") return 0;
    const n = Number(partySizeRaw);
    return Number.isFinite(n) ? n : 0;
  }, [partySizeRaw]);

  const partySizeForApi = useMemo(() => {
    const n = Math.max(1, partySizeNumber || 1);
    return Math.min(12, n);
  }, [partySizeNumber]);

  const tablesNeeded = useMemo(() => {
    const ps = Math.min(12, Math.max(1, Number(partySizeNumber || 1)));
    return Math.ceil(ps / 4);
  }, [partySizeNumber]);

  const deposit = tablesNeeded > 1 ? 200 : 0;

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
      tablesCount: tablesNeeded,
      deposit,

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

  useEffect(() => {
    form.setValue("date", day);
    form.setValue("hour", hour);
    form.setValue("partySize", partySizeForApi);
    form.setValue("tablesCount", tablesNeeded);
    form.setValue("deposit", deposit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, hour, partySizeForApi, tablesNeeded, deposit]);

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
          tablesNeeded,
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
    const res = await fetch("/api/reservations/stoliki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      alert(`Błąd:\n${JSON.stringify(err, null, 2)}`);
      console.log("API error:", err);
      return;
    }

    setStep(3);
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
            href="/api/regulamin"
            target="_blank"
            rel="noreferrer"
            className="underline transition-colors hover:text-foreground"
          >
            Zobacz regulamin
          </a>
        </p>
      </ReservationRules>

      {!isReservationsEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle>Rezerwacje wyłączone</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{disabledMessage}</p>
          </CardContent>
        </Card>
      ) : null}

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
            <div className="relative min-h-[420px]">
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

                  {selectedSlot ? (
                    <div className="text-sm text-muted-foreground">
                      Dostępne stoliki: <span className="font-medium">{remainingNow}</span>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2 max-w-[240px]">
                  <Label htmlFor="partySize">Liczba osób (max 12)</Label>
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

                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Podsumowanie</div>
                  <div className="grid gap-1">
                    <div className="font-medium">Stoliki: {tablesNeeded}</div>
                    <div className="text-sm text-muted-foreground">1 stolik = 4 osoby • Zaliczka: {formatPLN(deposit)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!gatedCanGoStep2}
                    onClick={() => setStep(2)}
                  >
                    Podaj dane
                  </Button>
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
              <div className="rounded-xl border p-4">
                <div className="text-sm text-muted-foreground">Podsumowanie</div>
                <div className="font-medium">
                  Stoliki • {day} • {hour} • Osób: {Math.min(12, Math.max(1, partySizeNumber || 1))} • Stoliki: {tablesNeeded}
                </div>
                <div className="text-sm text-muted-foreground">{deposit > 0 ? `Do zapłaty: ${formatPLN(deposit)}` : "Brak zaliczki."}</div>
                <div className="text-sm text-muted-foreground">
                  Dostępne stoliki: <span className="font-medium">{remainingNow}</span>
                </div>
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
                href="/api/privacy-policy"
              />

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Wróć
                </Button>

                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Wysyłam..." : "Wyślij rezerwację"}
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
