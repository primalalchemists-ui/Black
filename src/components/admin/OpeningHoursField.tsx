"use client"

import { useField } from "@payloadcms/ui"
import { useState } from "react"

// ─── Stałe ───────────────────────────────────────────────────────────────────

const DAYS = [
  { key: "monday",    label: "Poniedziałek" },
  { key: "tuesday",   label: "Wtorek"       },
  { key: "wednesday", label: "Środa"        },
  { key: "thursday",  label: "Czwartek"     },
  { key: "friday",    label: "Piątek"       },
  { key: "saturday",  label: "Sobota"       },
  { key: "sunday",    label: "Niedziela"    },
] as const

type DayKey = (typeof DAYS)[number]["key"]

// Sloty co 30 min: 00:00, 00:30, ..., 23:30
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2)
  const m = i % 2 === 0 ? "00" : "30"
  return `${String(h).padStart(2, "0")}:${m}`
})

// ─── Typy ─────────────────────────────────────────────────────────────────────

type DayState = {
  closed: boolean
  open: string   // "HH:mm"
  close: string  // "HH:mm"
}

type SavedEntry = {
  key: string
  label: string
  open?: string
  close?: string
}

// ─── Konwersja JSON ↔ stan formularza ─────────────────────────────────────────

function normTime(val: string | undefined, fallback: string): string {
  if (!val || val === "nieczynne") return fallback
  if (/^\d{2}:\d{2}:\d{2}$/.test(val)) return val.slice(0, 5) // strip seconds
  if (/^\d{2}:\d{2}$/.test(val)) return val
  return fallback
}

function parseValue(raw: unknown): Record<DayKey, DayState> {
  const state = {} as Record<DayKey, DayState>
  DAYS.forEach(d => {
    state[d.key] = { closed: true, open: "16:00", close: "22:00" }
  })

  if (!Array.isArray(raw)) return state

  for (const entry of raw as SavedEntry[]) {
    const match = DAYS.find(d => d.key === entry?.key)
    if (!match) continue
    const closed = !entry.open || entry.close === "nieczynne"
    state[match.key] = {
      closed,
      open:  normTime(entry.open,  "16:00"),
      close: closed ? "22:00" : normTime(entry.close, "22:00"),
    }
  }

  return state
}

function buildValue(state: Record<DayKey, DayState>): SavedEntry[] {
  return DAYS.map(d => {
    const s = state[d.key]
    return s.closed
      ? { key: d.key, label: d.label, close: "nieczynne" }
      : { key: d.key, label: d.label, open: s.open, close: s.close }
  })
}

// Jeśli aktualna wartość nie jest w siatce 30-min, dodaj ją jako opcję
function getOptions(current: string): string[] {
  return TIME_OPTIONS.includes(current)
    ? TIME_OPTIONS
    : [...TIME_OPTIONS, current].sort()
}

// ─── Komponent ────────────────────────────────────────────────────────────────

export function OpeningHoursField() {
  const { value, setValue } = useField<SavedEntry[]>({ path: "openingHours" })
  const [days, setDays] = useState<Record<DayKey, DayState>>(() => parseValue(value))

  function updateDay(key: DayKey, patch: Partial<DayState>) {
    const next = { ...days, [key]: { ...days[key], ...patch } }
    setDays(next)
    setValue(buildValue(next))
  }

  return (
    <div className="oh-field">
      <p className="oh-field__heading">Godziny otwarcia</p>
      <div className="oh-field__grid">
        {DAYS.map(d => {
          const s = days[d.key]
          return (
            <div key={d.key} className="oh-field__row">

              <span className="oh-field__day-name">{d.label}</span>

              <label className="oh-field__closed-label">
                <input
                  type="checkbox"
                  checked={s.closed}
                  onChange={e => updateDay(d.key, { closed: e.target.checked })}
                  className="oh-field__checkbox"
                />
                <span>Nieczynne</span>
              </label>

              {!s.closed && (
                <div className="oh-field__times">
                  <div className="oh-field__time-group">
                    <span className="oh-field__time-label">Otwarcie</span>
                    <select
                      value={s.open}
                      onChange={e => updateDay(d.key, { open: e.target.value })}
                      className="oh-field__select"
                      aria-label={`Godzina otwarcia — ${d.label}`}
                    >
                      {getOptions(s.open).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <span className="oh-field__dash" aria-hidden="true">–</span>

                  <div className="oh-field__time-group">
                    <span className="oh-field__time-label">Zamknięcie</span>
                    <select
                      value={s.close}
                      onChange={e => updateDay(d.key, { close: e.target.value })}
                      className="oh-field__select"
                      aria-label={`Godzina zamknięcia — ${d.label}`}
                    >
                      {getOptions(s.close).map(t => (
                        <option key={t} value={t}>
                          {t === "00:00" ? "00:00 (północ)" : t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OpeningHoursField
