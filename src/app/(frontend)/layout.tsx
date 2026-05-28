export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { Metadata } from "next"
import "./styles.css"
import { ReactNode } from "react"
import { Manrope } from "next/font/google"

import Header from "@/components/layout/Header"
import Footer from "@/components/layout/Footer"
import { getSiteSettings } from "@/lib/siteSettings"

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-manrope",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Centrum Spotkań Black",
  description: "Jedzenie. Rozrywka. Wspólne chwile.",
  icons: {
    icon: "/images/logo/logo.png",
    apple: "/images/logo/logo.png",
  },
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings()

  return (
    <html lang="pl" className={manrope.variable}>
      <body>
        {/* Skip link – WCAG 2.1 */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
        >
          Przejdź do treści
        </a>

        <Header />

        <div className="w-full h-full pt-16">
          <main id="main" className="max-w-[1200px] mx-auto md:py-12 min-h-dvh">
            {children}
          </main>
        </div>

        <Footer settings={settings} />
      </body>
    </html>
  )
}
