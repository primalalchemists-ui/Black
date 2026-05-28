"use client";

import { Card } from "@/components/ui/card";

type Props = {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  days?: number;
};

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DOW_PL = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"] as const;

export function WeekDateCards({ value, onChange, days = 7 }: Props) {
  const today = new Date();
  const list = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((d) => {
        const iso = toISODate(d);
        const active = iso === value;
        const label = `${DOW_PL[d.getDay()]} ${d.getDate()}.${String(
          d.getMonth() + 1
        ).padStart(2, "0")}`;

        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            aria-label={`Wybierz dzień ${label}${active ? " (wybrany)" : ""}`}
            className="text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card
              className={[
                "w-[120px] p-3 transition",
                active ? "bg-black text-white" : "hover:bg-muted/40",
              ].join(" ")}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className={active ? "text-white/80 text-xs" : "text-muted-foreground text-xs"}>
                {iso}
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
