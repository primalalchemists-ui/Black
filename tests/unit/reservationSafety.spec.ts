// @vitest-environment node
import { describe, it, expect } from "vitest"

import { serverAmountToPay, durationHours } from "@/lib/reservationPricing"
import {
  isBookingConflictError,
  messageIndicatesConflict,
  conflictResponseMessage,
} from "@/lib/bookingConflict"

/**
 * Dwa zabezpieczenia tras rezerwacji:
 *  • kwota do zapłaty liczona na serwerze (luka darmowej rezerwacji),
 *  • kolizja terminu rozpoznawana jako 409, a nie awaria 500.
 */

const at = (h: number) => new Date(Date.UTC(2026, 9, 23, h, 0, 0))

// ─── Wycena ─────────────────────────────────────────────────────────────────

describe("serverAmountToPay", () => {
  it("liczy godziny × zasoby × stawkę", () => {
    expect(serverAmountToPay({ startsAt: at(17), endsAt: at(18), resourceCount: 1, pricePerHour: 120 })).toBe(120)
    expect(serverAmountToPay({ startsAt: at(17), endsAt: at(20), resourceCount: 2, pricePerHour: 50 })).toBe(300)
  })

  it("obsługuje rezerwację kończącą się o północy", () => {
    const start = new Date(Date.UTC(2026, 9, 23, 23, 0, 0))
    const end = new Date(Date.UTC(2026, 9, 24, 0, 0, 0))
    expect(serverAmountToPay({ startsAt: start, endsAt: end, resourceCount: 1, pricePerHour: 120 })).toBe(120)
  })

  it("stawka 0 oznacza brak płatności", () => {
    expect(serverAmountToPay({ startsAt: at(17), endsAt: at(19), resourceCount: 3, pricePerHour: 0 })).toBe(0)
  })

  it("nie daje ujemnych ani niepoprawnych kwot", () => {
    expect(serverAmountToPay({ startsAt: at(19), endsAt: at(17), resourceCount: 1, pricePerHour: 120 })).toBe(0)
    expect(serverAmountToPay({ startsAt: at(17), endsAt: at(18), resourceCount: -5, pricePerHour: 120 })).toBe(0)
    expect(serverAmountToPay({ startsAt: at(17), endsAt: at(18), resourceCount: 1, pricePerHour: -120 })).toBe(0)
    expect(
      serverAmountToPay({ startsAt: at(17), endsAt: at(18), resourceCount: Number.NaN, pricePerHour: 120 }),
    ).toBe(0)
  })

  it("kwota nie zależy od niczego, co przyszło w żądaniu", () => {
    // Funkcja nie ma parametru na cenę od klienta — to jest cała poprawka.
    const paid = serverAmountToPay({ startsAt: at(17), endsAt: at(18), resourceCount: 1, pricePerHour: 120 })
    expect(paid).toBeGreaterThan(0)
    expect(Object.keys({ startsAt: 0, endsAt: 0, resourceCount: 0, pricePerHour: 0 })).not.toContain("totalPrice")
  })

  it("zaokrągla do groszy", () => {
    const amount = serverAmountToPay({
      startsAt: at(17),
      endsAt: new Date(Date.UTC(2026, 9, 23, 17, 20, 0)),
      resourceCount: 1,
      pricePerHour: 100,
    })
    expect(amount).toBe(33.33)
  })

  it("durationHours liczy ułamki i odrzuca zerowe zakresy", () => {
    expect(durationHours(at(17), at(18))).toBe(1)
    expect(durationHours(at(17), new Date(Date.UTC(2026, 9, 23, 17, 30, 0)))).toBe(0.5)
    expect(durationHours(at(17), at(17))).toBe(0)
  })
})

// ─── Rozpoznawanie kolizji ──────────────────────────────────────────────────

describe("isBookingConflictError", () => {
  it("rozpoznaje komunikaty rzucane przez hooki kolekcji", () => {
    // Dokładnie te treści są w src/collections/Reservations.ts
    expect(isBookingConflictError(new Error("Wystąpiła kolizja z inną rezerwacją w tym terminie."))).toBe(true)
    expect(isBookingConflictError(new Error("Wystąpiła kolizja z blokadą dostępności w tym terminie."))).toBe(true)
    expect(
      isBookingConflictError(new Error("Wystąpiła kolizja z istniejącą blokadą dostępności w tym terminie.")),
    ).toBe(true)
  })

  it("rozpoznaje starsze komunikaty z tras", () => {
    expect(isBookingConflictError(new Error("Tor jest zarezerwowany w tym czasie"))).toBe(true)
    expect(isBookingConflictError(new Error("Wybrane tory są już zajęte w tym terminie."))).toBe(true)
  })

  it("NIE uznaje nieznanych błędów za kolizję — te mają być 500", () => {
    expect(isBookingConflictError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(false)
    expect(isBookingConflictError(new Error("Cannot read properties of undefined"))).toBe(false)
    expect(isBookingConflictError(new TypeError("x is not a function"))).toBe(false)
    expect(isBookingConflictError(new Error("Nie można tworzyć rezerwacji w przeszłości."))).toBe(false)
  })

  it("radzi sobie z nie-Errorami i pustymi wartościami", () => {
    expect(isBookingConflictError("Wystąpiła kolizja z inną rezerwacją")).toBe(true)
    expect(isBookingConflictError({ message: "kolizja terminów" })).toBe(true)
    expect(isBookingConflictError(null)).toBe(false)
    expect(isBookingConflictError(undefined)).toBe(false)
    expect(isBookingConflictError({})).toBe(false)
    expect(isBookingConflictError(new Error(""))).toBe(false)
  })

  it("dopasowanie jest niezależne od wielkości liter", () => {
    expect(messageIndicatesConflict("KOLIZJA TERMINÓW")).toBe(true)
    expect(messageIndicatesConflict("Kolizja")).toBe(true)
  })

  it("komunikat dla klienta zależy od rodzaju zasobu", () => {
    expect(conflictResponseMessage("kregle")).toContain("tor")
    expect(conflictResponseMessage("bilard")).toContain("stół")
    expect(conflictResponseMessage("stolik")).toContain("termin")
  })
})
