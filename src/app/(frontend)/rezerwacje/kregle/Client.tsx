"use client";


import { useEffect, useMemo, useRef, useState } from "react";
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
import { ServerErrorMessage } from "@/components/reservations/ServerErrorMessage";

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

function doCancel(sessionId: string): void {
  fetch("/api/reservations/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {})
  try {
    // Usuń tylko jeśli pasuje — nie kasuj nowszej sesji
    if (sessionStorage.getItem("_pendingCancelSession") === sessionId) {
      sessionStorage.removeItem("_pendingCancelSession")
    }
  } catch {}
}

function sendBeaconCancel(sessionId: string): void {
  try {
    navigator.sendBeacon(
      "/api/reservations/cancel",
      new Blob([JSON.stringify({ sessionId })], { type: "application/json" })
    )
    // Usuń tylko jeśli pasuje — nie kasuj nowszej sesji (np. po re-submicie do P24)
    if (sessionStorage.getItem("_pendingCancelSession") === sessionId) {
      sessionStorage.removeItem("_pendingCancelSession")
    }
  } catch {}
}

export default function RezerwacjeKreglePage({ initialDate }: { initialDate?: string }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [gridReady, setGridReady] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridDisabledMsg, setGridDisabledMsg] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);

  const [day, setDay] = useState<string>(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) return initialDate;
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  });

  const [cfg, setCfg] = useState<{ pricePerHour: number; resourcesCount: number; startHour: number; endHour: number } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  useEffect(() => { activeSessionIdRef.current = activeSessionId }, [activeSessionId]);


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
      invoiceType: "" as "" | "personal" | "company",
      nip: "",

      acceptRules: false,
      acceptPrivacyPolicy: false,
    },
    mode: "onTouched",
    reValidateMode: "onChange",
    shouldFocusError: false,
  });

  // Mount: wykryj powrót z P24 (sessionStorage) lub osieroconą sesję.
  // NIE anuluj od razu po powrocie — użytkownik może kontynuować płatność.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const pendingSid = sessionStorage.getItem("_pendingCancelSession")
    const savedRaw = sessionStorage.getItem("_pendingFormState_kregle")

    if (pendingSid && savedRaw) {
      // Powrót z P24 — przywróć stan, ale NIE anuluj. Użytkownik może ponowić płatność.
      sessionStorage.removeItem("_pendingFormState_kregle")
      setActiveSessionId(pendingSid)
      try {
        const saved = JSON.parse(savedRaw)
        if (saved.day) setDay(saved.day)
        if (saved.grid) setGrid(saved.grid)
        if (saved.formValues) form.reset(saved.formValues)
        setStep(2)
      } catch {}
      setGridRefreshKey(k => k + 1)
    } else if (pendingSid && !savedRaw) {
      // Osierocona sesja (brak stanu formularza) — anuluj
      sessionStorage.removeItem("_pendingCancelSession")
      doCancel(pendingSid)
      setGridRefreshKey(k => k + 1)
    }
  }, [])

  // Anuluj przy odmontowaniu (SPA-navigation, kliknięcie "Wróć" poza stronę).
  useEffect(() => {
    return () => {
      const sid = activeSessionIdRef.current
      if (sid) doCancel(sid)
    }
  }, [])

  // Anuluj przy zamknięciu/opuszczeniu karty (pagehide = niezawodniejszy niż beforeunload).
  useEffect(() => {
    function onPageHide() {
      const sid = activeSessionIdRef.current
      if (sid) sendBeaconCancel(sid)
    }
    window.addEventListener("pagehide", onPageHide)
    return () => window.removeEventListener("pagehide", onPageHide)
  }, [])

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
      // Nie anuluj starej sesji przed POST — serwer obsługuje swap atomowo przez replaceSessionId
      const postPayload = {
        ...(values as any),
        segments: grid.segments,
        ...(activeSessionId ? { replaceSessionId: activeSessionId } : {}),
      };

      const res = await fetch("/api/reservations/kregle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postPayload),
      });

      const raw = await res.text();
      let parsed: any = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok) {
        console.error("POST /api/reservations/kregle failed", { status: res.status, raw, parsed, sent: postPayload });

        if (parsed?.error === "VALIDATION_ERROR" && Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            const path = issue.path?.[0];
            if (path) form.setError(path as any, { type: "server", message: issue.message });
          }
          form.setError("root.server" as any, { type: "server", message: parsed?.message ?? "Błąd walidacji." });
          return;
        }

        if (typeof parsed?.error === "string" && parsed.error.startsWith("REPLACE_")) {
          // Czyść session tylko gdy stara sesja definitywnie nie istnieje lub nie należy do tego klienta.
          // REPLACE_LOCKED/REPLACE_BUSY/REPLACE_PAID_DURING_SWAP — zachowaj session, callback może właśnie kończyć.
          const shouldClear = parsed.error === "REPLACE_NOT_FOUND" || parsed.error === "REPLACE_OWNERSHIP"
          if (shouldClear) {
            setActiveSessionId(null)
            try { sessionStorage.removeItem("_pendingCancelSession") } catch {}
          }
          form.setError("root.server" as any, { type: "server", message: parsed?.message ?? "Poprzednia sesja wygasła. Spróbuj ponownie." })
          return
        }

        if (parsed?.error === "NO_AVAILABILITY" || res.status === 409) {
          setConflictMessage("Wybrane tory nie są już dostępne. Odświeżyliśmy dostępność — wybierz inny termin lub tor.");
          setGridRefreshKey((k) => k + 1);
          setGrid({ startHour: null, endHour: null, resources: [], totalHours: 0, totalPrice: 0, segments: [] });
          setStep(1);
          return;
        }

        const ERROR_PL: Record<string, string> = {
          VENUE_BLOCKED: "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie.",
          RESERVATIONS_DISABLED: "Rezerwacje są chwilowo wyłączone.",
          PAST_TIME: "Nie można rezerwować godzin, które już minęły.",
          BAD_DATE: "Niepoprawna data rezerwacji.",
          PAYMENT_ERROR: "Nie udało się przetworzyć płatności. Skontaktuj się z obsługą lokalu: 601 275 261.",
        }
        const msg = parsed?.message ?? ERROR_PL[parsed?.error] ?? "Wystąpił błąd. Spróbuj ponownie.";
        form.setError("root.server" as any, { type: "server", message: msg });
        return;
      }

      const data = parsed ?? {};
      if (data?.redirectUrl) {
        if (data?.groupId) {
          sessionStorage.setItem("_pendingCancelSession", data.groupId)
          sessionStorage.setItem("_pendingFormState_kregle", JSON.stringify({
            day,
            grid,
            formValues: form.getValues(),
          }))
        }
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
        <p>Rezerwacje odbywają się na zasadach określonych w Regulaminie obiektu.</p>
        <p>
          <a
            href="/regulamin"
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
            <div className="grid gap-2">
              <WeekDateCards value={day} onChange={(d) => {
                // Zmiana daty = nowy wybór terminu — anuluj starą sesję (jeśli była)
                if (activeSessionId) {
                  doCancel(activeSessionId)
                  setActiveSessionId(null)
                }
                setDay(d)
                setConflictMessage(null)
              }} />
            </div>

            {conflictMessage ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {conflictMessage}
              </div>
            ) : null}

            <ResourceGrid
              key={gridRefreshKey}
              type="kregle"
              date={day}
              sessionId={activeSessionId ?? undefined}
              resourceLabel="Tor"
              resourcesCount={cfg?.resourcesCount ?? 4}
              pricePerHour={cfg?.pricePerHour ?? 120}
              startHour={cfg?.startHour ?? 16}
              endHour={cfg?.endHour ?? 22}
              onChange={(v) => { setGrid(v as any); setConflictMessage(null); }}
              onLoadingChange={({ ready }) => setGridReady(ready)}
              onEnabledChange={({ enabled, disabledMessage }) => {
                setGridEnabled(enabled);
                setGridDisabledMsg(disabledMessage);
              }}
            />

            {gridReady ? (
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  type="button"
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!canGoStep2}
                  onClick={() => setStep(2)}
                >
                  Podaj dane
                </Button>

                {!gridEnabled ? (
                  <span className="text-sm text-muted-foreground">{gridDisabledMsg || "Usługa jest chwilowo wyłączona."}</span>
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
                <p className="text-sm text-muted-foreground">Podsumowanie</p>

                {grid.segments.length ? (
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p className="font-semibold">Kręgle</p>
                      <p className="text-sm text-muted-foreground">{day.split("-").reverse().join(".")}</p>
                    </div>

                    <div className="grid gap-1.5">
                      {grid.segments.map((s) => (
                        <div
                          key={`${s.resource}-${s.startHour}-${s.endHour}`}
                          className="flex items-baseline justify-between gap-2 text-sm"
                        >
                          <span className="font-medium">Tor {s.resource}: <span className="font-normal text-muted-foreground">{formatHHMMFromFloat(s.startHour)}–{formatHHMMFromFloat(s.endHour + 1)}</span></span>
                          <span className="font-medium">{formatPLN(s.price)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Do zapłaty</span>
                      <span className="font-semibold">{formatPLN(payAmount)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2">
                    <p className="font-medium">
                      Kręgle • {day} • {startLabel}–{endLabel} • Wybrane tory: {grid.resources.length}
                    </p>
                    <p className="text-sm text-muted-foreground">Do zapłaty: {formatPLN(payAmount)}</p>
                  </div>
                )}
              </div>

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
                href="/polityka-prywatnosci"
              />

              <div className="grid gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>
                    Wróć
                  </Button>

                  <Button
                    type="submit"
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? "Przetwarzam..." : `Rezerwuję i płacę ${formatPLN(payAmount)}`}
                  </Button>
                </div>

                {form.formState.errors?.root?.server?.message ? (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    <ServerErrorMessage message={String(form.formState.errors.root.server.message)} />
                  </div>
                ) : null}
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
