"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { ReservationNav } from "@/components/reservations/ReservationNav"

const HIDE_NAV_PATHS = ["/rezerwacje/podziekowanie"]

export function RezerwacjeHeaderAndNav() {
  const pathname = usePathname()

  if (HIDE_NAV_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return null
  }

  return (
    <>
      <header className="grid gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Rezerwacje</h1>
        <p className="text-sm text-muted-foreground">Wybierz usługę i zarezerwuj termin.</p>
      </header>
      <ReservationNav />
      <Separator />
    </>
  )
}
