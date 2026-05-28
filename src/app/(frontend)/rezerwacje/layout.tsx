import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import { ReservationNav } from "@/components/reservations/ReservationNav";
import Script from "next/script";

const AccessibilityPanelScript = <Script
          id="wcag-dock"
          strategy="afterInteractive"
          src="//wcag.dock.codes/accessibility/Xpt4XX6zd4GJyeDOF04f/start.js"
        />

export default function RezerwacjeLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Rezerwacje" className="grid gap-6 px-4 py-4 md:px-0">
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Rezerwacje</h1>
        <p className="text-sm text-muted-foreground">
          Wybierz usługę i zarezerwuj termin.
        </p>
      </header>

      <ReservationNav />

      <div>{children}{AccessibilityPanelScript}</div>
    </section>
  );
}
