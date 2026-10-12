import { describe, it, expect } from "vitest"
import {
  localSegmentInterval,
  utcSegmentInterval,
  localBlackoutRange,
  utcBlackoutRange,
  segmentEndDayOffset,
  intervalKind,
  isZeroDuration,
  wallMinutes,
  MINUTES_PER_DAY,
} from "@/lib/reservationIntervals"

/**
 * Testy regresyjne dla rezerwacji kończących się o północy.
 *
 * Bug produkcyjny: rezerwacja toru 22:00–00:00 lub 23:00–00:00 była tworzona
 * i widoczna w panelu, ale tor pozostawał wolny — druga rezerwacja na ten sam
 * tor i czas przechodziła (double booking).
 *
 * Testy nie dotykają bazy danych. Odtwarzają logikę decyzyjną endpointów
 * (rekonstrukcja segmentu + `overlaps`) na izolowanych danych.
 */

// ─── Odwzorowanie logiki produkcyjnej ────────────────────────────────────────

/** Identyczne z `overlaps` w `_shared.ts` i w kolekcji `Reservations`. */
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd
}

type Seg = {
  resource: string
  startHour: number
  startMinute?: number
  endHour: number
  endMinute?: number
}

/** Slot godzinowy siatki dostępności: [h:00, h+1:00). Godzina 24 → północ D+1. */
function hourSlot(day: string, hour: number): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number)
  return {
    start: new Date(y, m - 1, d, hour, 0, 0, 0),
    end: new Date(y, m - 1, d, hour + 1, 0, 0, 0),
  }
}

/**
 * Odwzorowanie `statusForSlot` z `/api/reservations/{kregle,bilard}` GET:
 * czy dany tor jest zajęty w danym slocie godzinowym.
 */
function isSlotBusy(day: string, segments: Seg[], resourceId: string, hour: number): boolean {
  const slot = hourSlot(day, hour)
  return segments
    .filter((s) => s.resource === resourceId)
    .some((seg) => {
      const { start, end } = localSegmentInterval(day, seg)
      return overlaps(start, end, slot.start, slot.end)
    })
}

/**
 * Odwzorowanie server-side conflict checku z POST:
 * czy nowa rezerwacja (startHour → endHour inclusive) koliduje z istniejącymi.
 */
function hasConflict(
  day: string,
  existing: Seg[],
  candidate: { resource: string; startHour: number; endHour: number },
): boolean {
  const [y, m, d] = day.split("-").map(Number)
  // POST: endsAt = toDateAtHour(date, endHour + 1) — godzina 24 normalizuje się do D+1
  const candStart = new Date(y, m - 1, d, candidate.startHour, 0, 0, 0)
  const candEnd = new Date(y, m - 1, d, candidate.endHour + 1, 0, 0, 0)

  return existing
    .filter((s) => s.resource === candidate.resource)
    .some((seg) => {
      const { start, end } = localSegmentInterval(day, seg)
      return overlaps(start, end, candStart, candEnd)
    })
}

/** Stara, wadliwa rekonstrukcja — zachowana, by udowodnić istnienie buga. */
function naiveSegmentInterval(day: string, seg: Seg): { start: Date; end: Date } {
  const [y, m, d] = day.split("-").map(Number)
  return {
    start: new Date(y, m - 1, d, seg.startHour, seg.startMinute ?? 0, 0, 0),
    end: new Date(y, m - 1, d, seg.endHour, seg.endMinute ?? 0, 0, 0),
  }
}

const LANE_1 = "lane-1"
const LANE_2 = "lane-2"
const DAY = "2026-10-10"

// ─── 1. Dowód istnienia buga ─────────────────────────────────────────────────

describe("regresja: stara rekonstrukcja gubiła dzień końca", () => {
  const seg: Seg = { resource: LANE_1, startHour: 23, endHour: 0 }

  it("stara implementacja tworzyła interwał o ujemnej długości", () => {
    const naive = naiveSegmentInterval(DAY, seg)
    expect(naive.end.getTime()).toBeLessThan(naive.start.getTime())
  })

  it("stara implementacja raportowała tor jako WOLNY o 23:00 (bug)", () => {
    const slot = hourSlot(DAY, 23)
    const naive = naiveSegmentInterval(DAY, seg)
    expect(overlaps(naive.start, naive.end, slot.start, slot.end)).toBe(false)
  })

  it("nowa implementacja nigdy nie zwraca odwróconego interwału", () => {
    const fixed = localSegmentInterval(DAY, seg)
    expect(fixed.end.getTime()).toBeGreaterThan(fixed.start.getTime())
  })
})

// ─── 2. Reguła przesunięcia dnia ─────────────────────────────────────────────

describe("segmentEndDayOffset", () => {
  it("zwykły interwał w obrębie dnia → offset 0", () => {
    expect(segmentEndDayOffset({ startHour: 18, endHour: 20 })).toBe(0)
    expect(segmentEndDayOffset({ startHour: 22, endHour: 23 })).toBe(0)
  })

  it("koniec o północy → offset 1", () => {
    expect(segmentEndDayOffset({ startHour: 22, endHour: 0 })).toBe(1)
    expect(segmentEndDayOffset({ startHour: 23, endHour: 0 })).toBe(1)
  })

  it("interwał przez północ → offset 1", () => {
    expect(segmentEndDayOffset({ startHour: 22, endHour: 2 })).toBe(1)
  })

  it("obsługuje minuty", () => {
    expect(segmentEndDayOffset({ startHour: 23, startMinute: 30, endHour: 0, endMinute: 30 })).toBe(1)
    expect(segmentEndDayOffset({ startHour: 18, startMinute: 0, endHour: 18, endMinute: 30 })).toBe(0)
  })

  it("toleruje stringi i wartości puste (dane historyczne)", () => {
    expect(segmentEndDayOffset({ startHour: "23", endHour: "0" })).toBe(1)
    expect(segmentEndDayOffset({ startHour: 18, endHour: undefined })).toBe(1)
  })

  it("wallMinutes i MINUTES_PER_DAY", () => {
    expect(wallMinutes(23, 30)).toBe(1410)
    expect(wallMinutes(0, 0)).toBe(0)
    expect(MINUTES_PER_DAY).toBe(1440)
  })
})

// ─── 3. Dostępność slotów (główne kryterium sukcesu) ─────────────────────────

describe("dostępność: 18:00–20:00 (zwykła rezerwacja, bez regresji)", () => {
  const segs: Seg[] = [{ resource: LANE_1, startHour: 18, endHour: 20 }]

  it("blokuje 18 i 19", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 18)).toBe(true)
    expect(isSlotBusy(DAY, segs, LANE_1, 19)).toBe(true)
  })

  it("nie blokuje 17 ani 20", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 17)).toBe(false)
    expect(isSlotBusy(DAY, segs, LANE_1, 20)).toBe(false)
  })
})

describe("dostępność: 22:00–00:00 (granica północy)", () => {
  const segs: Seg[] = [{ resource: LANE_1, startHour: 22, endHour: 0 }]

  it("blokuje 22 i 23", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 22)).toBe(true)
    expect(isSlotBusy(DAY, segs, LANE_1, 23)).toBe(true)
  })

  it("nie blokuje 21", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 21)).toBe(false)
  })

  it("nie blokuje innego toru", () => {
    expect(isSlotBusy(DAY, segs, LANE_2, 22)).toBe(false)
    expect(isSlotBusy(DAY, segs, LANE_2, 23)).toBe(false)
  })
})

describe("dostępność: 23:00–00:00 (granica północy)", () => {
  const segs: Seg[] = [{ resource: LANE_1, startHour: 23, endHour: 0 }]

  it("blokuje 23", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 23)).toBe(true)
  })

  it("nie blokuje 22", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 22)).toBe(false)
  })
})

describe("dostępność: 22:00–23:00 (sąsiedni zwykły interwał)", () => {
  const segs: Seg[] = [{ resource: LANE_1, startHour: 22, endHour: 23 }]

  it("blokuje 22, nie blokuje 23", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 22)).toBe(true)
    expect(isSlotBusy(DAY, segs, LANE_1, 23)).toBe(false)
  })
})

// ─── 4. Server-side odrzucenie kolizji ───────────────────────────────────────

describe("conflict check: druga rezerwacja musi zostać odrzucona", () => {
  it("23:00–00:00 blokuje kolejną 23:00–00:00 na tym samym torze", () => {
    const existing: Seg[] = [{ resource: LANE_1, startHour: 23, endHour: 0 }]
    expect(hasConflict(DAY, existing, { resource: LANE_1, startHour: 23, endHour: 23 })).toBe(true)
  })

  it("22:00–00:00 blokuje kolejną 23:00–00:00 na tym samym torze", () => {
    const existing: Seg[] = [{ resource: LANE_1, startHour: 22, endHour: 0 }]
    expect(hasConflict(DAY, existing, { resource: LANE_1, startHour: 23, endHour: 23 })).toBe(true)
  })

  it("22:00–00:00 blokuje nakładającą się 21:00–23:00", () => {
    const existing: Seg[] = [{ resource: LANE_1, startHour: 22, endHour: 0 }]
    expect(hasConflict(DAY, existing, { resource: LANE_1, startHour: 21, endHour: 22 })).toBe(true)
  })

  it("nie blokuje tego samego czasu na INNYM torze", () => {
    const existing: Seg[] = [{ resource: LANE_1, startHour: 23, endHour: 0 }]
    expect(hasConflict(DAY, existing, { resource: LANE_2, startHour: 23, endHour: 23 })).toBe(false)
  })

  it("nie blokuje interwału sąsiadującego (20:00–22:00 po 18:00–20:00)", () => {
    const existing: Seg[] = [{ resource: LANE_1, startHour: 18, endHour: 20 }]
    expect(hasConflict(DAY, existing, { resource: LANE_1, startHour: 20, endHour: 21 })).toBe(false)
  })

  it("nie blokuje 21:00–22:00 przed rezerwacją 22:00–00:00", () => {
    const existing: Seg[] = [{ resource: LANE_1, startHour: 22, endHour: 0 }]
    expect(hasConflict(DAY, existing, { resource: LANE_1, startHour: 21, endHour: 21 })).toBe(false)
  })
})

// ─── 5. Wiele zasobów z różnymi godzinami ────────────────────────────────────

describe("rezerwacja wielozasobowa z różnymi segmentami", () => {
  const segs: Seg[] = [
    { resource: LANE_1, startHour: 22, endHour: 0 },
    { resource: LANE_2, startHour: 18, endHour: 20 },
  ]

  it("każdy tor blokowany tylko w swoim przedziale", () => {
    expect(isSlotBusy(DAY, segs, LANE_1, 23)).toBe(true)
    expect(isSlotBusy(DAY, segs, LANE_2, 23)).toBe(false)
    expect(isSlotBusy(DAY, segs, LANE_2, 18)).toBe(true)
    expect(isSlotBusy(DAY, segs, LANE_1, 18)).toBe(false)
  })

  it("conflict check respektuje segment per zasób", () => {
    expect(hasConflict(DAY, segs, { resource: LANE_2, startHour: 23, endHour: 23 })).toBe(false)
    expect(hasConflict(DAY, segs, { resource: LANE_1, startHour: 23, endHour: 23 })).toBe(true)
  })
})

// ─── 6. Granice kalendarzowe ─────────────────────────────────────────────────

describe("granice kalendarzowe", () => {
  it("koniec miesiąca: 2026-10-31 23:00–00:00 → 2026-11-01", () => {
    const { start, end } = localSegmentInterval("2026-10-31", { startHour: 23, endHour: 0 })
    expect(start.getDate()).toBe(31)
    expect(start.getMonth()).toBe(9)
    expect(end.getDate()).toBe(1)
    expect(end.getMonth()).toBe(10)
    expect(end.getFullYear()).toBe(2026)
  })

  it("koniec roku: 2026-12-31 23:00–00:00 → 2027-01-01", () => {
    const { start, end } = localSegmentInterval("2026-12-31", { startHour: 23, endHour: 0 })
    expect(start.getFullYear()).toBe(2026)
    expect(end.getFullYear()).toBe(2027)
    expect(end.getMonth()).toBe(0)
    expect(end.getDate()).toBe(1)
  })

  it("rok przestępny: 2028-02-28 23:00–00:00 → 2028-02-29", () => {
    const { end } = localSegmentInterval("2028-02-28", { startHour: 23, endHour: 0 })
    expect(end.getMonth()).toBe(1)
    expect(end.getDate()).toBe(29)
  })

  it("blokuje slot 23:00 w ostatnim dniu roku", () => {
    const segs: Seg[] = [{ resource: LANE_1, startHour: 23, endHour: 0 }]
    expect(isSlotBusy("2026-12-31", segs, LANE_1, 23)).toBe(true)
  })
})

// ─── 7. Zmiana czasu (DST) w Europe/Warsaw ───────────────────────────────────

describe("zmiana czasu — czas zegarowy musi zostać zachowany", () => {
  // Europe/Warsaw 2026: zmiana na letni 29.03, na zimowy 25.10.
  // Asercje są niezależne od strefy serwera: sprawdzamy, że konstruktor Date
  // zachowuje czas ZEGAROWY (czego arytmetyka milisekund by nie zrobiła).
  const dstDays = ["2026-03-29", "2026-10-25"]

  for (const day of dstDays) {
    it(`${day}: 23:00–00:00 zachowuje godzinę zegarową i przechodzi na następny dzień`, () => {
      const { start, end } = localSegmentInterval(day, { startHour: 23, endHour: 0 })
      expect(start.getHours()).toBe(23)
      expect(end.getHours()).toBe(0)
      expect(end.getTime()).toBeGreaterThan(start.getTime())
      expect(end.getDate()).not.toBe(start.getDate())
    })

    it(`${day}: 18:00–20:00 zachowuje godziny zegarowe w obrębie dnia`, () => {
      const { start, end } = localSegmentInterval(day, { startHour: 18, endHour: 20 })
      expect(start.getHours()).toBe(18)
      expect(end.getHours()).toBe(20)
      expect(end.getDate()).toBe(start.getDate())
    })

    it(`${day}: slot 23:00 jest zajęty`, () => {
      const segs: Seg[] = [{ resource: LANE_1, startHour: 23, endHour: 0 }]
      expect(isSlotBusy(day, segs, LANE_1, 23)).toBe(true)
    })
  }
})

// ─── 8. Baza UTC (panel administratora) ──────────────────────────────────────

describe("utcSegmentInterval — ścieżka panelu administratora", () => {
  it("23:00–00:00 przechodzi na następny dzień w UTC", () => {
    const { start, end } = utcSegmentInterval("2026-10-10T00:00:00.000Z", {
      startHour: 23,
      endHour: 0,
    })
    expect(start.toISOString()).toBe("2026-10-10T23:00:00.000Z")
    expect(end.toISOString()).toBe("2026-10-11T00:00:00.000Z")
  })

  it("zwykły interwał pozostaje w tym samym dniu", () => {
    const { start, end } = utcSegmentInterval("2026-10-10T00:00:00.000Z", {
      startHour: 18,
      endHour: 20,
    })
    expect(start.toISOString()).toBe("2026-10-10T18:00:00.000Z")
    expect(end.toISOString()).toBe("2026-10-10T20:00:00.000Z")
  })

  it("akceptuje obiekt Date jako dzień", () => {
    const { end } = utcSegmentInterval(new Date("2026-12-31T00:00:00.000Z"), {
      startHour: 23,
      endHour: 0,
    })
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z")
  })

  it("nigdy nie zwraca odwróconego interwału", () => {
    for (let h = 0; h < 24; h++) {
      const { start, end } = utcSegmentInterval("2026-10-10T00:00:00.000Z", {
        startHour: h,
        endHour: 0,
      })
      // h = 0 → 00:00–00:00 to zero-duration, NIE interwał 24-godzinny.
      // h > 0 → koniec o północy należy do następnego dnia.
      if (h === 0) {
        expect(end.getTime()).toBe(start.getTime())
      } else {
        expect(end.getTime()).toBeGreaterThan(start.getTime())
      }
    }
  })
})

// ─── 9. Rekordy historyczne (kompatybilność wstecz) ──────────────────────────

describe("kompatybilność z rekordami zapisanymi przed fiksem", () => {
  it("rekord 18:00–20:00 zapisany wcześniej działa identycznie jak dotąd", () => {
    const seg: Seg = { resource: LANE_1, startHour: 18, startMinute: 0, endHour: 20, endMinute: 0 }
    const naive = naiveSegmentInterval(DAY, seg)
    const fixed = localSegmentInterval(DAY, seg)
    expect(fixed.start.getTime()).toBe(naive.start.getTime())
    expect(fixed.end.getTime()).toBe(naive.end.getTime())
  })

  it("wszystkie interwały nieprzechodzące przez północ są bit-w-bit identyczne", () => {
    for (let sh = 0; sh < 23; sh++) {
      for (let eh = sh + 1; eh < 24; eh++) {
        const seg: Seg = { resource: LANE_1, startHour: sh, endHour: eh }
        const naive = naiveSegmentInterval(DAY, seg)
        const fixed = localSegmentInterval(DAY, seg)
        expect(fixed.start.getTime()).toBe(naive.start.getTime())
        expect(fixed.end.getTime()).toBe(naive.end.getTime())
      }
    }
  })

  it("rekord historyczny kończący się o północy zostaje NAPRAWIONY bez zmiany danych", () => {
    // Ten sam wiersz w bazie, inna (poprawna) interpretacja przy odczycie.
    const seg: Seg = { resource: LANE_1, startHour: 22, endHour: 0 }
    expect(isSlotBusy(DAY, [seg], LANE_1, 22)).toBe(true)
    expect(isSlotBusy(DAY, [seg], LANE_1, 23)).toBe(true)
  })
})


// ─── 10. Zero-duration: NIE jest rezerwacja 24-godzinna ─────────────────────

describe("zero-duration jest odrozniane od przejscia przez polnoc", () => {
  it("intervalKind klasyfikuje trzy stany", () => {
    expect(intervalKind({ startHour: 18, endHour: 20 })).toBe("same_day")
    expect(intervalKind({ startHour: 23, endHour: 0 })).toBe("overnight")
    expect(intervalKind({ startHour: 22, endHour: 2 })).toBe("overnight")
    expect(intervalKind({ startHour: 18, endHour: 18 })).toBe("zero_duration")
    expect(intervalKind({ startHour: 0, endHour: 0 })).toBe("zero_duration")
  })

  it("isZeroDuration wykrywa rowne czasy, takze z minutami", () => {
    expect(isZeroDuration({ startHour: 18, startMinute: 30, endHour: 18, endMinute: 30 })).toBe(true)
    expect(isZeroDuration({ startHour: 18, startMinute: 0, endHour: 18, endMinute: 30 })).toBe(false)
  })

  it("zero-duration NIE jest rolowane na nastepny dzien", () => {
    expect(segmentEndDayOffset({ startHour: 18, endHour: 18 })).toBe(0)
    const { start, end } = localSegmentInterval(DAY, { startHour: 18, endHour: 18 })
    expect(end.getTime()).toBe(start.getTime())
    expect(end.getDate()).toBe(start.getDate())
  })

  it("zero-duration nie blokuje zadnego slotu (zamiast blokowac 24 h)", () => {
    const segs: Seg[] = [{ resource: LANE_1, startHour: 18, endHour: 18 }]
    for (const h of [17, 18, 19, 23]) {
      expect(isSlotBusy(DAY, segs, LANE_1, h)).toBe(false)
    }
  })

  it("przejscie przez polnoc nadal jest rolowane", () => {
    expect(segmentEndDayOffset({ startHour: 23, endHour: 0 })).toBe(1)
    expect(segmentEndDayOffset({ startHour: 22, endHour: 2 })).toBe(1)
  })
})

// ─── 11. Zakresy blackoutow ─────────────────────────────────────────────────

describe("localBlackoutRange", () => {
  it("blackout 22:00-00:00 konczy sie nastepnego dnia", () => {
    const r = localBlackoutRange(DAY, { startHour: "22", endHour: "0" })
    expect(r).not.toBeNull()
    expect(r!.s.getHours()).toBe(22)
    expect(r!.e.getHours()).toBe(0)
    expect(r!.e.getTime()).toBeGreaterThan(r!.s.getTime())
    expect(r!.e.getDate()).not.toBe(r!.s.getDate())
  })

  it("zwykly blackout dzienny bez zmian", () => {
    const r = localBlackoutRange(DAY, { startHour: "14", endHour: "16" })
    expect(r!.s.getHours()).toBe(14)
    expect(r!.e.getHours()).toBe(16)
    expect(r!.e.getDate()).toBe(r!.s.getDate())
  })

  it("allDay obejmuje caly dzien", () => {
    const r = localBlackoutRange(DAY, { allDay: true })
    expect(r!.s.getHours()).toBe(0)
    expect(r!.e.getHours()).toBe(23)
    expect(r!.e.getMinutes()).toBe(59)
  })

  it("zero-duration zwraca null", () => {
    expect(localBlackoutRange(DAY, { startHour: "20", endHour: "20" })).toBeNull()
  })

  it("nieprawidlowe godziny zwracaja null", () => {
    expect(localBlackoutRange(DAY, { startHour: "abc", endHour: "16" })).toBeNull()
    expect(localBlackoutRange(DAY, { startHour: "14", endHour: undefined })).toBeNull()
  })

  it("blackout 22:00-00:00 pokrywa sloty 22:00 i 23:00, ale nie 21:00", () => {
    const r = localBlackoutRange(DAY, { startHour: "22", endHour: "0" })!
    const covers = (h: number) => {
      const slot = hourSlot(DAY, h)
      return overlaps(r.s, r.e, slot.start, slot.end)
    }
    expect(covers(21)).toBe(false)
    expect(covers(22)).toBe(true)
    expect(covers(23)).toBe(true)
  })

  it("blackout konczacy sie o polnocy w ostatnim dniu roku", () => {
    const r = localBlackoutRange("2026-12-31", { startHour: "22", endHour: "0" })!
    expect(r.e.getFullYear()).toBe(2027)
    expect(r.e.getMonth()).toBe(0)
    expect(r.e.getDate()).toBe(1)
  })
})

describe("utcBlackoutRange", () => {
  it("22:00-00:00 w UTC", () => {
    const r = utcBlackoutRange("2026-10-10T00:00:00.000Z", { startHour: "22", endHour: "0" })!
    expect(r.s.toISOString()).toBe("2026-10-10T22:00:00.000Z")
    expect(r.e.toISOString()).toBe("2026-10-11T00:00:00.000Z")
  })

  it("allDay w UTC obejmuje caly dzien", () => {
    const r = utcBlackoutRange("2026-10-10T00:00:00.000Z", { allDay: true })!
    expect(r.s.toISOString()).toBe("2026-10-10T00:00:00.000Z")
    expect(r.e.toISOString()).toBe("2026-10-10T23:59:59.999Z")
  })

  it("zero-duration zwraca null", () => {
    expect(utcBlackoutRange("2026-10-10T00:00:00.000Z", { startHour: "20", endHour: "20" })).toBeNull()
  })
})
