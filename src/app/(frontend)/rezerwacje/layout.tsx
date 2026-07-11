import type { ReactNode } from "react";
import Script from "next/script";
import { RezerwacjeHeaderAndNav } from "@/components/reservations/RezerwacjeHeaderAndNav";

const AccessibilityPanelScript = (
  <Script
    id="wcag-dock"
    strategy="afterInteractive"
    src="//wcag.dock.codes/accessibility/Xpt4XX6zd4GJyeDOF04f/start.js"
  />
)

export default function RezerwacjeLayout({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Rezerwacje" className="grid gap-6 px-4 py-4 md:px-0">
      <RezerwacjeHeaderAndNav />
      <div>
        {children}
        {AccessibilityPanelScript}
      </div>
    </section>
  );
}
