"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatPLN } from "@/components/reservations/money";

type Status = "free" | "busy" | "blocked";

type ApiResource = { id: string; number: number; label?: string | null };
type ApiSlot = { time: string; statuses: Record<string, Status> };

type ApiResponse =
  | {
      ok: true;
      enabled: boolean;
      disabledMessage?: string | null;
      pricePerHour: number;
      slotMinutes: number;
      resources: ApiResource[];
      slots: ApiSlot[];
    }
  | { ok: false; error: string };

type Segment = {
  resource: number;
  startHour: number;
  endHour: number; // start ostatniego slotu
  totalHours: number;
  price: number;
};

type Props = {
  resourceLabel: string;
  resourcesCount: number; // fallback
  startHour?: number; // fallback
  endHour?: number; // fallback
  pricePerHour: number; // fallback

  type?: "bilard" | "kregle";
  date?: string;

  onChange?: (v: {
    startHour: number | null; // float (np 16.75)
    endHour: number | null; // float (to jest start ostatniego slotu)
    resources: number[]; // unikalne numery zasobów z segmentów
    totalHours: number;
    totalPrice: number;
    segments: Segment[];
  }) => void;

  // ✅ NOWE: parent może ukryć przycisk/tekst dopóki grid nie gotowy
  onLoadingChange?: (v: { loading: boolean; ready: boolean }) => void;
  onEnabledChange?: (v: { enabled: boolean; disabledMessage: string | null }) => void;
};

function parseHHMM(t: string) {
  const [hh, mm] = t.split(":").map((x) => Number(x));
  return { hh: hh || 0, mm: mm || 0 };
}

function hourFloatFromHHMM(t: string) {
  const { hh, mm } = parseHHMM(t);
  return hh + mm / 60;
}

function formatHHMMFromFloat(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function makeStatusMapFallback(resourcesCount: number, times: string[]) {
  const map: Record<string, Status> = {};
  for (let r = 1; r <= resourcesCount; r++) {
    for (const t of times) {
      const seed = (r * 97 + t.length * 31) % 10;
      let s: Status = "free";
      if (seed === 0 || seed === 1) s = "busy";
      if (seed === 9) s = "blocked";
      map[`${r}-${t}`] = s;
    }
  }
  return map;
}

export function ResourceGrid({
  resourceLabel,
  resourcesCount,
  startHour = 16,
  endHour = 22,
  pricePerHour: priceFallback,
  type,
  date,
  onChange,
  onLoadingChange,
  onEnabledChange,
}: Props) {
  const shouldFetch = Boolean(type && date);

  const [api, setApi] = useState<{
    enabled: boolean;
    disabledMessage: string | null;
    pricePerHour: number;
    slotMinutes: number;
    resources: ApiResource[];
    slots: ApiSlot[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [fetchedOnce, setFetchedOnce] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!type || !date) {
        setApi(null);
        setFetchedOnce(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/reservations/${type}?date=${encodeURIComponent(date)}`);
        const json = (await res.json().catch(() => null)) as ApiResponse | null;

        if (!alive) return;

        if (!res.ok || !json || (json as any).ok !== true) {
          setApi(null);
          return;
        }

        const ok = json as Extract<ApiResponse, { ok: true }>;
        setApi({
          enabled: ok.enabled,
          disabledMessage: ok.disabledMessage ?? null,
          pricePerHour: ok.pricePerHour,
          slotMinutes: ok.slotMinutes,
          resources: ok.resources ?? [],
          slots: ok.slots ?? [],
        });
      } finally {
        if (alive) {
          setLoading(false);
          setFetchedOnce(true);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [type, date]);

  const timesFallback = useMemo(() => {
    const arr: string[] = [];
    for (let h = startHour; h <= endHour; h++) arr.push(`${String(h).padStart(2, "0")}:00`);
    return arr;
  }, [startHour, endHour]);

  const times = api?.slots?.length ? api.slots.map((s) => s.time) : timesFallback;

  const resources = api?.resources?.length
    ? api.resources
    : Array.from({ length: resourcesCount }, (_, i) => ({ id: `fallback-${i + 1}`, number: i + 1, label: null }));

  const enabled = api?.enabled ?? true;
  const disabledMessage = api?.disabledMessage ?? null;
  const pricePerHour = api?.pricePerHour ?? priceFallback;
  const slotMinutes = api?.slotMinutes ?? 60;

  const statusMapFallback = useMemo(() => makeStatusMapFallback(resourcesCount, times), [resourcesCount, times]);

  function getStatus(resourceNumber: number, time: string): Status {
    if (!enabled) return "blocked";

    if (api?.slots?.length) {
      const slot = api.slots.find((s) => s.time === time);
      if (!slot) return "blocked";

      const r = resources.find((x) => x.number === resourceNumber);
      if (!r) return "blocked";

      return slot.statuses?.[r.id] ?? "blocked";
    }

    return statusMapFallback[`${resourceNumber}-${time}`] ?? "blocked";
  }

  // =========================
  // WYBÓR: segments
  // =========================
  const [segments, setSegments] = useState<Segment[]>([]);

  function onCellClick(resource: number, idx: number) {
    const st = getStatus(resource, times[idx]!);
    if (st !== "free") return;

    setSegments((prev) => {
      const existing = prev.find((s) => s.resource === resource);
      const t = times[idx]!;
      const hour = hourFloatFromHHMM(t);

      if (!existing) {
        const totalHours = slotMinutes / 60;
        const price = totalHours * pricePerHour;
        return [...prev, { resource, startHour: hour, endHour: hour, totalHours, price }];
      }

      const startIdx = times.findIndex((x) => hourFloatFromHHMM(x) === existing.startHour);
      const endIdx = times.findIndex((x) => hourFloatFromHHMM(x) === existing.endHour);

      const inRange = idx >= startIdx && idx <= endIdx;

      if (inRange) {
        return prev.filter((s) => s.resource !== resource);
      }

      if (idx === endIdx + 1) {
        const nextStatus = getStatus(resource, times[idx]!);
        if (nextStatus !== "free") return prev;

        const newEndHour = hourFloatFromHHMM(times[idx]!);
        const totalSlots = idx - startIdx + 1;
        const totalHours = (totalSlots * slotMinutes) / 60;
        const price = totalHours * pricePerHour;

        return prev.map((s) => (s.resource === resource ? { ...s, endHour: newEndHour, totalHours, price } : s));
      }

      const totalHours = slotMinutes / 60;
      const price = totalHours * pricePerHour;
      return prev.map((s) => (s.resource === resource ? { ...s, startHour: hour, endHour: hour, totalHours, price } : s));
    });
  }

  function isSelected(resource: number, idx: number) {
    const seg = segments.find((s) => s.resource === resource);
    if (!seg) return false;

    const h = hourFloatFromHHMM(times[idx]!);
    return h >= seg.startHour && h <= seg.endHour;
  }

  const totalPrice = useMemo(() => segments.reduce((acc, s) => acc + (s.price || 0), 0), [segments]);
  const totalHours = useMemo(() => segments.reduce((acc, s) => acc + (s.totalHours || 0), 0), [segments]);

  const resourcesPicked = useMemo(() => {
    const set = new Set<number>();
    for (const s of segments) set.add(s.resource);
    return Array.from(set).sort((a, b) => a - b);
  }, [segments]);

  const legacyStartHour = useMemo(() => {
    if (!segments.length) return null;
    return Math.min(...segments.map((s) => s.startHour));
  }, [segments]);

  const legacyEndHour = useMemo(() => {
    if (!segments.length) return null;
    return Math.max(...segments.map((s) => s.endHour));
  }, [segments]);

  const lastEmitKey = useRef<string>("");

  useEffect(() => {
    const payload = {
      startHour: legacyStartHour,
      endHour: legacyEndHour,
      resources: resourcesPicked,
      totalHours,
      totalPrice,
      segments: segments.slice().sort((a, b) => a.resource - b.resource),
    };

    const key = JSON.stringify(payload);
    if (key === lastEmitKey.current) return;
    lastEmitKey.current = key;

    onChange?.(payload);
  }, [onChange, legacyStartHour, legacyEndHour, resourcesPicked, totalHours, totalPrice, segments]);

  // =========================
  // GATING + OVERLAY
  // =========================
  const isGatedLoading = shouldFetch && (!fetchedOnce || loading);
  const ready = shouldFetch ? fetchedOnce && !loading : true;

  // ✅ powiadamiaj parent o stanie grid
  useEffect(() => {
    onLoadingChange?.({ loading: isGatedLoading, ready });
  }, [onLoadingChange, isGatedLoading, ready]);

  useEffect(() => {
    if (!fetchedOnce) return;
    onEnabledChange?.({ enabled, disabledMessage });
  }, [onEnabledChange, fetchedOnce, enabled, disabledMessage]);

  useEffect(() => {
    setSegments([]);
  }, [type, date]);

  return (
    <div className="relative min-h-[520px]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isGatedLoading ? 0 : 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{ pointerEvents: isGatedLoading ? "none" : "auto" }}
      >
        <div className="grid gap-3 mt-2">
          <div className="text-sm text-muted-foreground">
            Kolory: <span className="font-medium text-green-700">wolne</span>,{" "}
            <span className="font-medium text-red-600">zajęte</span>,{" "}
            <span className="font-medium text-black">niedostępne</span>.
            <br />
            Każdy {resourceLabel.toLowerCase()} wybierasz <b>osobno</b>. Klikasz kolejne godziny <b>ciągiem</b>, a klik w już
            wybrane usuwa wybór.
          </div>

          <div className="overflow-x-auto mt-8">
            <div className="min-w-[720px]">
              <div className="grid" style={{ gridTemplateColumns: `60px repeat(${resources.length}, 1fr)` }}>
                <div />
                {resources.map((r) => (
                  <div key={r.id} className="pb-2 text-center text-sm font-semibold">
                    {resourceLabel} {r.number}
                  </div>
                ))}
              </div>

              <div className="grid gap-2 mt-1">
                {times.map((t, idx) => (
                  <div key={t} className="grid items-center gap-2" style={{ gridTemplateColumns: `60px repeat(${resources.length}, 1fr)` }}>
                    <div className="text-sm text-muted-foreground">{t}</div>

                    {resources.map((rr) => {
                      const rNum = rr.number;
                      const st = getStatus(rNum, t);
                      const sel = isSelected(rNum, idx);

                      // const base = "h-10 w-full rounded-md border transition";
                      // const color = st === "free" ? "bg-green-600/80 hover:bg-green-600" : st === "busy" ? "bg-red-600/80" : "bg-black/80";
                      // const ring = sel ? "ring-2 ring-black" : "";

                      const base = "relative h-10 w-full rounded-md border transition-colors flex items-center justify-center";
                      const color =
                        st === "free"
                          ? "bg-green-600/80 hover:bg-green-600"
                          : st === "busy"
                            ? "bg-red-600/80"
                            : "bg-black/80";

                      // const ring = sel ? "outline outline-2 outline-black outline-offset-2" : "";

                      return (
                        // <button
                        //   key={`${rNum}-${t}`}
                        //   type="button"
                        //   onClick={() => onCellClick(rNum, idx)}
                        //   disabled={st !== "free"}
                        //   className={[base, color, ring].join(" ")}
                        //   aria-label={`${resourceLabel} ${rNum}, ${t}, status ${st}`}
                        //   title={st === "free" ? "Wolne" : st === "busy" ? "Zajęte" : "Niedostępne"}
                        // />
                        <button
                          key={`${rNum}-${t}`}
                          type="button"
                          onClick={() => onCellClick(rNum, idx)}
                          disabled={st !== "free"}
                          className={[base, color].join(" ")}
                          aria-label={`${resourceLabel} ${rNum}, ${t}, status ${st}`}
                          title={st === "free" ? "Wolne" : st === "busy" ? "Zajęte" : "Niedostępne"}
                        >
                          <span
                            aria-hidden="true"
                            className="pointer-events-none text-xs font-medium text-white/80 select-none"
                          >
                            {st === "free" ? "Wolne" : st === "busy" ? "Zajęte" : ""}
                          </span>
                          {sel ? (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 rounded-md border-2 border-black"
                            />
                          ) : null}
                        </button>

                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4 mt-8">
            <div className="text-sm text-muted-foreground">Wybrano</div>

            {!segments.length ? (
              <div className="font-medium">—</div>
            ) : (
              <div className="grid gap-1">
                <div className="font-medium">
                  {resourceLabel}:{" "}
                  {segments
                    .slice()
                    .sort((a, b) => a.resource - b.resource)
                    .map((s) => `${s.resource} • ${formatHHMMFromFloat(s.startHour)}–${formatHHMMFromFloat(s.endHour + slotMinutes / 60)}`)
                    .join(" | ")}
                </div>
                <div className="text-sm text-muted-foreground">
                  Czas: {totalHours} h • {type === "bilard" ? "Wybrane stoły" : type === "kregle" ? "Wybrane tory" : "Zasoby"}: {segments.length} • Cena: {formatPLN(totalPrice)}
                </div>
              </div>
            )}

            <input type="hidden" name="startHour" value={legacyStartHour == null ? "" : String(legacyStartHour)} />
            <input type="hidden" name="endHour" value={legacyEndHour == null ? "" : String(legacyEndHour)} />
            <input type="hidden" name="resources" value={resourcesPicked.join(",")} />
            <input type="hidden" name="totalPrice" value={segments.length ? totalPrice : ""} />
            <input type="hidden" name="segments" value={segments.length ? JSON.stringify(segments) : ""} />
          </div>
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
  );
}
