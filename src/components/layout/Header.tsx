"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"

import { Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const NAV = [
  { href: "/restauracja", label: "Restauracja" },
  { href: "/rozrywka", label: "Rozrywka" },
  { href: "/imprezy", label: "Imprezy" },
  { href: "/biznes", label: "Biznes" },
  { href: "/rezerwacje", label: "Rezerwacje" },
] as const

const BRAND_CLS =
  "bg-[hsl(var(--brand))] text-[hsl(var(--brand-foreground))] hover:bg-[hsl(var(--brand-hover))] hover:text-[hsl(var(--brand-foreground))]"

const RESERVATION_CLS =
  "bg-primary text-primary-foreground hover:bg-[hsl(30,4%,18%)] hover:text-primary-foreground"

const NORMAL_CLS = "hover:bg-accent hover:text-accent-foreground"

export default function Header() {
  const [open, setOpen] = React.useState(false)

  return (
    <header id="header" className="fixed inset-x-0 top-0 z-40 bg-background/80 backdrop-blur-md shadow-[0_2px_16px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-[1232px] items-center justify-between gap-4 px-4 py-3">
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-2" aria-label="Strona główna">
          <Image
            src="/images/logo/logo.png"
            alt="Centrum Spotkań Black"
            width={160}
            height={48}
            priority
            className="h-10 w-auto"
          />
        </Link>

        {/* DESKTOP NAV */}
        <nav className="hidden md:flex items-center gap-2" aria-label="Główna nawigacja">
          {NAV.map((item) => {
            const isReservation = item.href === "/rezerwacje"
            return (
              <Button
                asChild
                key={item.href}
                variant="ghost"
                className={isReservation ? RESERVATION_CLS : NORMAL_CLS}
              >
                <Link href={item.href}>{item.label}</Link>
              </Button>
            )
          })}
        </nav>

        {/* MOBILE NAV */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Otwórz menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[320px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <nav className="mt-6 grid gap-2" aria-label="Menu mobilne">
                {NAV.map((item) => {
                  const isReservation = item.href === "/rezerwacje"
                  return (
                    <Button
                      asChild
                      key={item.href}
                      variant="ghost"
                      className={`justify-start ${isReservation ? RESERVATION_CLS : NORMAL_CLS}`}
                    >
                      <Link href={item.href} onClick={() => setOpen(false)}>
                        {item.label}
                      </Link>
                    </Button>
                  )
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
