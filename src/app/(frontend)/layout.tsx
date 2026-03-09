export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next"
import "./styles.css"
import { ReactNode } from "react"

import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { Separator } from "@/components/ui/separator"
import { getSiteSettings } from "@/lib/siteSettings"

export const metadata: Metadata = {
  title: "Centrum Spotkań Black",
  description: "Jedzenie. Rozrywka. Wspólne chwile.",

  
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings()

  return (
    <html lang="pl">
      <body>
        {/* Skip link – WCAG 2.1 */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
        >
          Przejdź do treści
        </a>

        <Header />

        <div className="bg-warm-glow w-full h-full">
          <main id="main" className="max-w-[1200px] mx-auto md:py-12 min-h-dvh">
            {children}
          </main>
        </div>

        {/* <Separator className="shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)]" /> */}
        <Footer settings={settings} />
      </body>
    </html>
  )
}
