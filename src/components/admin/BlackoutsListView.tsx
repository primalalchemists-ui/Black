"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type Blackout = {
  id: string | number
  title?: string
  service?: string
  day?: string
  allDay?: boolean
  startHour?: string | number
  startMinute?: string | number
  endHour?: string | number
  endMinute?: string | number
  active?: boolean
  reason?: string
}

type ApiResult = {
  docs: Blackout[]
  totalDocs: number
  totalPages: number
  page: number
}

type ServiceFilter = "all" | "bowling" | "billiard"
type DateFilter = "all" | "today" | "tomorrow" | "weekend" | "custom"

const SERVICE_LABELS: Record<string, string> = {
  bowling: "Kręgle",
  billiard: "Bilard",
}

const SERVICE_FILTERS: { value: ServiceFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "bowling", label: "Kręgle" },
  { value: "billiard", label: "Bilard" },
]

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Wszystkie daty" },
  { value: "today", label: "Dzisiaj" },
  { value: "tomorrow", label: "Jutro" },
  { value: "weekend", label: "Ten weekend" },
  { value: "custom", label: "Wybierz datę" },
]

function toWarsawDate(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" })
}

function getDateRange(filter: DateFilter, customDate: string): { from: string; to: string } {
  const now = new Date()
  if (filter === "today") {
    const t = toWarsawDate(now)
    return { from: `${t}T00:00:00.000Z`, to: `${t}T23:59:59.999Z` }
  }
  if (filter === "tomorrow") {
    const tom = new Date(now)
    tom.setDate(tom.getDate() + 1)
    const t = toWarsawDate(tom)
    return { from: `${t}T00:00:00.000Z`, to: `${t}T23:59:59.999Z` }
  }
  if (filter === "weekend") {
    const day = now.getDay()
    const toSat = day === 6 ? 0 : (6 - day + 7) % 7 || 7
    const sat = new Date(now)
    sat.setDate(now.getDate() + toSat)
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    return { from: `${toWarsawDate(sat)}T00:00:00.000Z`, to: `${toWarsawDate(sun)}T23:59:59.999Z` }
  }
  if (filter === "custom" && customDate) {
    return { from: `${customDate}T00:00:00.000Z`, to: `${customDate}T23:59:59.999Z` }
  }
  return { from: "", to: "" }
}

function buildApiUrl(search: string, serviceFilter: ServiceFilter, dateFilter: DateFilter, customDate: string, page: number, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "-day", depth: "0" })
  const term = search.trim()
  const { from, to } = getDateRange(dateFilter, customDate)
  let a = 0

  if (term) {
    ;["title", "reason"].forEach((field, i) => {
      params.set(`where[and][${a}][or][${i}][${field}][like]`, term)
    })
    a++
  }
  if (serviceFilter !== "all") {
    params.set(`where[and][${a}][service][equals]`, serviceFilter)
    a++
  }
  if (from) { params.set(`where[and][${a}][day][greater_than_equal]`, from); a++ }
  if (to)   { params.set(`where[and][${a}][day][less_than_equal]`, to);    a++ }

  return `/api/blackouts?${params.toString()}`
}

function formatDate(day: string | undefined): string {
  if (!day) return "—"
  try {
    return new Date(day).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" })
  } catch { return "—" }
}

function formatTime(h: string | number | undefined, m: string | number | undefined): string {
  if (h == null || m == null) return "—"
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

const LIMIT = 20

export function BlackoutsListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Blokady dostępności" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all")
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")
  const [customDate, setCustomDate] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) return
    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    const delay = search ? 300 : 0
    timerRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)
      setError("")

      fetch(buildApiUrl(search, serviceFilter, dateFilter, customDate, page, LIMIT), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania blokad.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, serviceFilter, dateFilter, customDate, page])

  const handleServiceFilter = (v: ServiceFilter) => { setPage(1); setServiceFilter(v) }
  const handleDateFilter = (v: DateFilter) => { setPage(1); setDateFilter(v); if (v !== "custom") setCustomDate("") }
  const handleSearch = (val: string) => { setSearch(val); setPage(1) }

  const docs = data?.docs ?? []
  const totalDocs = data?.totalDocs ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="black-admin-list">
      <div className="black-admin-list__header">
        <h1 className="black-admin-list__title">Blokady dostępności</h1>
        <a href="/admin/collections/blackouts/create" className="black-admin-list__create-btn">
          + Dodaj nową
        </a>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po nazwie lub powodzie"
          className="black-admin-list__search-input"
        />
      </div>

      <div className="black-admin-list__filters">
        {DATE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleDateFilter(value)}
            className={"black-admin-list__filter-btn" + (dateFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
        {dateFilter === "custom" && (
          <input type="date" aria-label="Wybierz datę" value={customDate}
            onChange={(e) => { setCustomDate(e.target.value); setPage(1) }}
            className="black-admin-list__date-input" />
        )}
      </div>

      <div className="black-admin-list__filters black-admin-list__filters--types">
        {SERVICE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleServiceFilter(value)}
            className={"black-admin-list__filter-btn" + (serviceFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__divider" />
      {error && <div className="black-admin-list__error">{error}</div>}

      {loading ? (
        <div className="black-admin-list__loading">Ładowanie…</div>
      ) : docs.length === 0 ? (
        <div className="black-admin-list__empty">Brak blokad spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Usługa</th>
                <th>Dzień</th>
                <th>Czas</th>
                <th>Cały dzień</th>
                <th>Aktywna</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>{r.title || <span className="black-admin-list__muted">—</span>}</td>
                  <td>{SERVICE_LABELS[r.service ?? ""] ?? r.service ?? "—"}</td>
                  <td>{formatDate(r.day)}</td>
                  <td>
                    {r.allDay
                      ? <span className="black-admin-list__muted">cały dzień</span>
                      : `${formatTime(r.startHour, r.startMinute)} – ${formatTime(r.endHour, r.endMinute)}`}
                  </td>
                  <td>{r.allDay ? "Tak" : "Nie"}</td>
                  <td>
                    <span className={`black-admin-list__status black-admin-list__status--${r.active ? "confirmed" : "cancelled"}`}>
                      {r.active ? "Tak" : "Nie"}
                    </span>
                  </td>
                  <td>
                    <a href={`/admin/collections/blackouts/${r.id}`} className="black-admin-list__action-link">
                      Otwórz →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="black-admin-list__pagination">
          <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className="black-admin-list__page-btn">
            ← Poprzednia
          </button>
          <span className="black-admin-list__pagination-info">
            Strona {page} z {totalPages} <span className="black-admin-list__muted">({totalDocs} blokad)</span>
          </span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="black-admin-list__page-btn">
            Następna →
          </button>
        </div>
      )}

      {!loading && totalDocs > 0 && totalPages === 1 && (
        <div className="black-admin-list__count">{totalDocs} {totalDocs === 1 ? "blokada" : totalDocs < 5 ? "blokady" : "blokad"}</div>
      )}
    </div>
  )
}

export default BlackoutsListView
