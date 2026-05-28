"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/rezerwacje/stoliki", label: "Stoliki" },
  { href: "/rezerwacje/kregle", label: "Kręgle" },
  { href: "/rezerwacje/bilard", label: "Bilard" },
  { href: "/rezerwacje/biznes", label: "Biznes" },
];

export function ReservationNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Nawigacja rezerwacji" className="flex flex-wrap gap-2">
      {LINKS.map((l) => {
        const active =
          pathname === l.href ||
          (pathname === "/rezerwacje" && l.href === "/rezerwacje/stoliki");

        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[44px] items-center rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-foreground hover:bg-[hsl(var(--brand-soft))] hover:text-[hsl(var(--brand-foreground))]"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
