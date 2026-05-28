import { Info } from "lucide-react";

export function ReservationRules({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="grid gap-0.5">
        <div className="font-medium text-foreground">{title}</div>
        <div className="text-muted-foreground [&>p]:leading-snug">{children}</div>
      </div>
    </div>
  );
}
