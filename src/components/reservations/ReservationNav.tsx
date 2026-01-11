"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

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
          <Button
            key={l.href}
            asChild
            variant={active ? "default" : "outline"}
            className={active ? "bg-black text-white hover:bg-black/90" : ""}
            aria-current={active ? "page" : undefined}
          >
            <Link href={l.href}>{l.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}
