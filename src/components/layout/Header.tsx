"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

const NAV = [
  { href: "/restauracja", label: "Restauracja" },
  { href: "/rozrywka", label: "Rozrywka" },
  { href: "/imprezy", label: "Imprezy" },
  { href: "/biznes", label: "Biznes" },
  { href: "/rezerwacje", label: "Rezerwacje" },
] as const

export default function Header() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  return (
    <header id="header" className="border-b shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)]">
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
          {NAV.map((item) => (
            <Button
              asChild
              key={item.href}
              variant="ghost"
              className={
                isActive(item.href)
                  ? "bg-[hsl(var(--brand)/0.9)]"
                  : ""
              }
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>

        {/* MOBILE NAV */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" aria-label="Otwórz menu">
                Menu
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[320px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <nav className="mt-6 grid gap-2" aria-label="Menu mobilne">
                {NAV.map((item) => (
                  <Button
                    asChild
                    key={item.href}
                    variant="ghost"
                    className={`justify-start ${
                      isActive(item.href)
                        ? "bg-[hsl(var(--brand)/0.9)]"
                        : ""
                    }`}
                  >
                    <Link href={item.href}>{item.label}</Link>
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
