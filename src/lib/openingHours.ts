// Helper do sprawdzania godzin otwarcia i blokad lokalu przez wydarzenia

import { getPayload } from "payload"
import config from "@payload-config"

export interface DayHours {
  open: boolean
  openHour: number
  openMinute: number
  closeHour: number
  closeMinute: number
}

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

function parseHHMM(timeStr: string): { h: number; m: number } | null {
  const [hStr, mStr] = String(timeStr || "").split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return { h, m }
}

function weekdayKeyFromDateStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00.000Z")
  return WEEKDAY_KEYS[d.getUTCDay()]
}

/**
 * Pobiera godziny otwarcia dla konkretnego dnia (z globalnego site-settings).
 * Fallback: lokal otwarty 16:00–22:00.
 */
export async function getOpeningHoursForDay(dateStr: string): Promise<DayHours> {
  const fallback: DayHours = { open: true, openHour: 16, openMinute: 0, closeHour: 22, closeMinute: 0 }

  try {
    const payload = await getPayload({ config })
    const settings = await payload.findGlobal({ slug: "site-settings", overrideAccess: true })

    const hours = (settings as any)?.openingHours
    if (!Array.isArray(hours)) return fallback

    const dayKey = weekdayKeyFromDateStr(dateStr)
    const dayEntry = hours.find((h: any) => h.key === dayKey)
    if (!dayEntry) return fallback

    if (dayEntry.open === false || dayEntry.open === "false") {
      return { open: false, openHour: 0, openMinute: 0, closeHour: 0, closeMinute: 0 }
    }

    const openParsed = parseHHMM(String(dayEntry.open ?? "16:00"))
    const closeParsed = parseHHMM(String(dayEntry.close ?? "22:00"))
    if (!openParsed || !closeParsed) return fallback

    // close = 00:00 → traktujemy jako 23:59 (po północy)
    let closeHour = closeParsed.h
    let closeMinute = closeParsed.m
    if (closeHour === 0 && closeMinute === 0) { closeHour = 23; closeMinute = 59 }

    return { open: true, openHour: openParsed.h, openMinute: openParsed.m, closeHour, closeMinute }
  } catch {
    return fallback
  }
}

export function isVenueClosed(hours: DayHours): boolean {
  return !hours.open
}

export function isWithinOpeningHours(hours: DayHours, startHour: number, startMinute: number): boolean {
  if (!hours.open) return false
  const slot = startHour * 60 + startMinute
  const open = hours.openHour * 60 + hours.openMinute
  const close = hours.closeHour * 60 + hours.closeMinute
  return slot >= open && slot < close
}

export function getClosedVenueMessage(): string {
  return "Brak możliwości rezerwacji — lokal nieczynny."
}

export function getVenueBlockedMessage(): string {
  return "Brak możliwości rezerwacji — lokal zarezerwowany na wydarzenie."
}

/**
 * Pobiera wszystkie wydarzenia blokujące lokal na dany dzień.
 */
export async function getBlockingEventsForDay(dateStr: string): Promise<any[]> {
  try {
    const payload = await getPayload({ config })
    const dayStart = new Date(dateStr + "T00:00:00.000Z").toISOString()
    const dayEnd = new Date(dateStr + "T23:59:59.999Z").toISOString()
    const result = await payload.find({
      collection: "events",
      limit: 20,
      overrideAccess: true,
      where: {
        and: [
          { blocksVenue: { equals: true } },
          { status: { not_equals: "cancelled" } },
          { day: { greater_than_equal: dayStart } },
          { day: { less_than_equal: dayEnd } },
        ],
      },
    })
    return result.docs as any[]
  } catch {
    return []
  }
}

/**
 * Sprawdza czy konkretny slot (godzina:minuta) jest zablokowany przez któreś z przekazanych wydarzeń.
 * Eventy z blockAllDay=true blokują cały dzień.
 * Eventy bez blockAllDay blokują tylko przedział startHour–endHour (lub startHour–24:00 gdy brak końca).
 */
export function isSlotBlockedByVenueEvent(events: any[], slotHour: number, slotMinute: number): boolean {
  for (const event of events) {
    if (event.allDay || event.blockAllDay) return true
    const eventStartMins = (Number(event.startHour) || 0) * 60 + (Number(event.startMinute) || 0)
    const eventEndMins = event.endHour != null
      ? Number(event.endHour) * 60 + (Number(event.endMinute) || 0)
      : 24 * 60
    const slotMins = slotHour * 60 + slotMinute
    if (slotMins >= eventStartMins && slotMins < eventEndMins) return true
  }
  return false
}

/**
 * Sprawdza czy dany dzień jest zablokowany przez wydarzenie z blocksVenue=true.
 * Opcjonalnie sprawdza konkretną godzinę (checkHour/checkMinute).
 * Bez checkHour: blokuje tylko gdy blockAllDay=true (częściowe blokady są sprawdzane per-slot).
 */
export async function getBlockingEvent(
  dateStr: string,
  checkHour?: number,
  checkMinute?: number,
): Promise<{ blocked: boolean; eventTitle?: string }> {
  try {
    const events = await getBlockingEventsForDay(dateStr)
    if (!events.length) return { blocked: false }

    for (const event of events) {
      if (event.allDay || event.blockAllDay) {
        return { blocked: true, eventTitle: event.title }
      }

      if (checkHour !== undefined) {
        const eventStart = (Number(event.startHour) || 0) * 60 + (Number(event.startMinute) || 0)
        const eventEnd = event.endHour != null
          ? Number(event.endHour) * 60 + (Number(event.endMinute) || 0)
          : 24 * 60
        const checkMins = checkHour * 60 + (checkMinute ?? 0)
        if (checkMins >= eventStart && checkMins < eventEnd) {
          return { blocked: true, eventTitle: event.title }
        }
      }
      // bez checkHour i bez blockAllDay → nie blokujemy całego dnia
    }

    return { blocked: false }
  } catch {
    return { blocked: false }
  }
}
