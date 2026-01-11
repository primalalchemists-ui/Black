"use client";

import { Card } from "@/components/ui/card";

export function ReservationStepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Wybór terminu" },
    { n: 2, label: "Podanie danych" },
    { n: 3, label: "Gotowe!" },
  ] as const;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        {items.map((it, idx) => {
          const active = it.n === step;
          const done = it.n < step;

          return (
            <div key={it.n} className="flex items-center gap-3">
              <div
                className={[
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border",
                  active ? "bg-black text-white border-black" : "",
                  done ? "bg-black/10 border-black/30" : "",
                ].join(" ")}
              >
                {it.n}
              </div>
              <div className={active ? "font-semibold" : "text-muted-foreground"}>
                {it.label}
              </div>

              {idx !== items.length - 1 ? (
                <div className="mx-1 h-px w-10 bg-border" />
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
