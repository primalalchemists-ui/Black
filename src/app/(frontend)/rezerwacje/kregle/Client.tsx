"use client";


import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { ReservationRules } from "@/components/reservations/ReservationRules";
import { CustomerFields } from "@/components/reservations/CustomerFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeekDateCards } from "@/components/reservations/WeekDateCards";
import { InvoiceFields } from "@/components/reservations/InvoiceFields";
import { ResourceGrid } from "@/components/reservations/ResourceGrid";
import { ReservationStepper } from "@/components/reservations/ReservationStepper";
import { AcceptRulesCard } from "@/components/reservations/AcceptRulesCard";
import { formatPLN } from "@/components/reservations/money";

import { bowlingRequestSchema, type BowlingRequest } from "@/lib/validation/reservations";

function formatHHMMFromFloat(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

type Segment = {
  resource: number;
  startHour: number;
  endHour: number;
  totalHours: number;
  price: number;
};

type AvailabilityResponse =
  | {
      ok: true;
      enabled: boolean;
      disabledMessage?: string | null;
      pricePerHour: number;
      slotMinutes: number;
      resources: { id: string; number: number; label?: string | null }[];
      slots: { time: string; statuses: Record<string, "free" | "busy" | "blocked"> }[];
    }
  | { ok: false; error: string };

export default function RezerwacjeKreglePage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [gridReady, setGridReady] = useState(false);


  const [day, setDay] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  });

  const [cfg, setCfg] = useState<{ pricePerHour: number; resourcesCount: number; startHour: number; endHour: number } | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await fetch(`/api/reservations/kregle?date=${encodeURIComponent(day)}`);
        const json = (await res.json().catch(() => null)) as AvailabilityResponse | null;

        if (!alive) return;

        if (!res.ok || !json || (json as any).ok !== true) {
          setCfg({ pricePerHour: 120, resourcesCount: 4, startHour: 16, endHour: 22 });
          return;
        }

        const ok = json as Extract<AvailabilityResponse, { ok: true }>;
        const resourcesCount = Array.isArray(ok.resources) && ok.resources.length ? ok.resources.length : 4;

        const startHour = ok.slots?.[0]?.time ? Number(ok.slots[0].time.split(":")[0]) : 16;
        const endHour =
          ok.slots?.length && ok.slots[ok.slots.length - 1]?.time
            ? Number(ok.slots[ok.slots.length - 1].time.split(":")[0])
            : 22;

        setCfg({
          pricePerHour: Number(ok.pricePerHour ?? 120),
          resourcesCount,
          startHour,
          endHour,
        });
      } catch {
        if (alive) setCfg({ pricePerHour: 120, resourcesCount: 4, startHour: 16, endHour: 22 });
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [day]);

  const [grid, setGrid] = useState<{
    startHour: number | null;
    endHour: number | null;
    resources: number[];
    totalHours: number;
    totalPrice: number;
    segments: Segment[];
  }>({ startHour: null, endHour: null, resources: [], totalHours: 0, totalPrice: 0, segments: [] });

  const canGoStep2 = useMemo(() => grid.segments.length > 0, [grid.segments]);

  const payAmount = grid.totalPrice;

  const form = useForm<BowlingRequest>({
    resolver: zodResolver(bowlingRequestSchema),
    defaultValues: {
      type: "kregle",
      date: day,
      startHour: 0,
      endHour: 0,
      resources: [],
      totalPrice: 0,

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
    if (step !== 2) return;

    form.setValue("date", day, { shouldValidate: true });

    form.setValue("startHour", (grid.startHour ?? 0) as any, { shouldValidate: true });
    form.setValue("endHour", (grid.endHour ?? 0) as any, { shouldValidate: true });
    form.setValue("resources", grid.resources, { shouldValidate: true });
    form.setValue("totalPrice", payAmount, { shouldValidate: true });

    (form as any).setValue("segments", grid.segments, { shouldValidate: false });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, day, grid.startHour, grid.endHour, grid.resources, grid.segments, payAmount]);

  async function onSubmit(values: BowlingRequest) {
    try {
      const payload = { ...(values as any), segments: grid.segments };

      const res = await fetch("/api/reservations/kregle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      let parsed: any = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok) {
        console.error("POST /api/reservations/kregle failed", { status: res.status, raw, parsed, sent: payload });

        if (parsed?.error === "VALIDATION_ERROR" && Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            const path = issue.path?.[0];
            if (path) form.setError(path as any, { type: "server", message: issue.message });
          }
          form.setError("root.server" as any, { type: "server", message: parsed?.message ?? "Błąd walidacji." });
          return;
        }

        const msg = parsed?.message ?? parsed?.error ?? (raw?.slice(0, 600) ? raw.slice(0, 600) : `HTTP ${res.status}`);
        form.setError("root.server" as any, { type: "server", message: msg });
        return;
      }

      const data = parsed ?? {};
      if (data?.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      setStep(3);
    } catch (e: any) {
      console.error(e);
      form.setError("root.server" as any, { type: "server", message: "Błąd sieci / serwera. Spróbuj ponownie." });
    }
  }

  const startLabel = grid.startHour != null ? formatHHMMFromFloat(grid.startHour) : "—";
  const endLabel = grid.endHour != null ? formatHHMMFromFloat(grid.endHour + 1) : "—";

  return (
    <div className="grid gap-6">
      <ReservationStepper step={step} />

      <ReservationRules title="Zasady rezerwacji kręgli">
        <p>Cena: wg ustawień (panel CMS).</p>
        <p>Docelowo: płatność z góry (P24).</p>
        <p>Możesz wybrać różne godziny dla różnych torów.</p>
      </ReservationRules>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Wybór terminu</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <WeekDateCards value={day} onChange={setDay} />
            </div>

            <ResourceGrid
              type="kregle"
              date={day}
              resourceLabel="Tor"
              resourcesCount={cfg?.resourcesCount ?? 4}
              pricePerHour={cfg?.pricePerHour ?? 120}
              startHour={cfg?.startHour ?? 16}
              endHour={cfg?.endHour ?? 22}
              onChange={(v) => setGrid(v as any)}
              onLoadingChange={({ ready }) => setGridReady(ready)}

            />

            {gridReady ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!canGoStep2}
                  onClick={() => setStep(2)}
                >
                  Podaj dane
                </Button>

                {!canGoStep2 ? (
                  <div className="text-sm text-muted-foreground self-center">Wybierz przynajmniej jeden tor.</div>
                ) : null}
              </div>
            ) : null}


          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <form className="grid gap-6" onSubmit={form.handleSubmit(onSubmit)} aria-label="Formularz rezerwacji kręgli">
          <Card>
            <CardHeader>
              <CardTitle>Twoje dane</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-6">
              <div className="rounded-xl border p-4">
                <div className="text-sm text-muted-foreground">Podsumowanie</div>

                {grid.segments.length ? (
                  <div className="grid gap-2">
                    {grid.segments.map((s) => (
                      <div key={`${s.resource}-${s.startHour}-${s.endHour}`} className="font-medium">
                        Kręgle • {day} • Tor {s.resource} • {formatHHMMFromFloat(s.startHour)}–{formatHHMMFromFloat(s.endHour + 1)} •{" "}
                        {formatPLN(s.price)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="font-medium">
                    Kręgle • {day} • {startLabel}–{endLabel} • Tory: {grid.resources.join(", ")}
                  </div>
                )}

                <div className="text-sm text-muted-foreground">Do zapłaty: {formatPLN(payAmount)}</div>
              </div>

              {form.formState.errors?.root?.server?.message ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                  {String(form.formState.errors.root.server.message)}
                </div>
              ) : null}

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

                <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Wysyłam..." : `Rezerwuję i płacę ${formatPLN(payAmount)}`}
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
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setStep(1)}>
              Zrób kolejną rezerwację
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
