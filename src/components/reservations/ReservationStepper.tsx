"use client";

export function ReservationStepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { n: 1, label: "Termin" },
    { n: 2, label: "Dane" },
    { n: 3, label: "Gotowe!" },
  ] as const;

  return (
    <div className="flex items-center">
      {items.map((it, idx) => {
        const active = it.n === step;
        const done = it.n < step;

        return (
          <div key={it.n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                  active ? "bg-primary text-primary-foreground" : "",
                  done ? "bg-[hsl(var(--brand))] text-[hsl(var(--brand-foreground))]" : "",
                  !active && !done ? "border border-border bg-muted text-muted-foreground" : "",
                ].join(" ")}
              >
                {done ? "✓" : it.n}
              </div>
              <span
                className={`text-sm ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {it.label}
              </span>
            </div>
            {idx !== items.length - 1 && (
              <div className={`mx-3 h-px w-8 ${done ? "bg-[hsl(var(--brand))]" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
