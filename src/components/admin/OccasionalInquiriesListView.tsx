"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type Inquiry = {
  id: string | number
  type?: string
  date?: string
  startHour?: string | number
  startMinute?: string | number
  name?: string
  phone?: string
  email?: string
  people?: number
  status?: string
  payment?: {
    depositPaid?: boolean
    totalPaid?: boolean
  }
}

function getPaymentStatus(payment: Inquiry["payment"]): { label: string; cls: string } {
  if (payment?.totalPaid)   return { label: "Całość opłacona",    cls: "paid" }
  if (payment?.depositPaid) return { label: "Zaliczka opłacona",  cls: "pending" }
  return                           { label: "Brak płatności",      cls: "not_required" }
}

type ApiResult = {
  docs: Inquiry[]
  totalDocs: number
  totalPages: number
  page: number
}

type TypeFilter = "all" | "komunia" | "stypa" | "urodziny" | "inne"
type DateFilter = "all" | "today" | "tomorrow" | "weekend" | "custom"

const TYPE_LABELS: Record<string, string> = {
  komunia: "Komunia",
  stypa: "Stypa",
  urodziny: "Urodziny",
  inne: "Inne",
}

const STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  in_progress: "W trakcie",
  confirmed: "Potwierdzone",
  rejected: "Odrzucone",
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "komunia", label: "Komunia" },
  { value: "stypa", label: "Stypa" },
  { value: "urodziny", label: "Urodziny" },
  { value: "inne", label: "Inne" },
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

function buildApiUrl(search: string, typeFilter: TypeFilter, dateFilter: DateFilter, customDate: string, page: number, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "-date", depth: "0" })
  const term = search.trim()
  const { from, to } = getDateRange(dateFilter, customDate)
  let a = 0

  if (term) {
    ;["name", "phone", "email"].forEach((field, i) => {
      params.set(`where[and][${a}][or][${i}][${field}][like]`, term)
    })
    a++
  }
  if (typeFilter !== "all") {
    params.set(`where[and][${a}][type][equals]`, typeFilter)
    a++
  }
  if (from) { params.set(`where[and][${a}][date][greater_than_equal]`, from); a++ }
  if (to)   { params.set(`where[and][${a}][date][less_than_equal]`, to);    a++ }

  return `/api/occasional-inquiries?${params.toString()}`
}

function formatDateTime(date: string | undefined, startHour: string | number | undefined, startMinute: string | number | undefined): string {
  if (!date) return "—"
  try {
    const datePart = new Date(date).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Warsaw" })
    if (startHour != null && startMinute != null) {
      return `${datePart}, ${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}`
    }
    return datePart
  } catch { return "—" }
}

const LIMIT = 20

export function OccasionalInquiriesListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Zapytania okolicznościowe" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
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

      fetch(buildApiUrl(search, typeFilter, dateFilter, customDate, page, LIMIT), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania zapytań.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, typeFilter, dateFilter, customDate, page])

  const handleTypeFilter = (v: TypeFilter) => { setPage(1); setTypeFilter(v) }
  const handleDateFilter = (v: DateFilter) => { setPage(1); setDateFilter(v); if (v !== "custom") setCustomDate("") }
  const handleSearch = (val: string) => { setSearch(val); setPage(1) }

  const docs = data?.docs ?? []
  const totalDocs = data?.totalDocs ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="black-admin-list">
      <div className="black-admin-list__header">
        <h1 className="black-admin-list__title">Zapytania okolicznościowe</h1>
        <a href="/admin/collections/occasional-inquiries/create" className="black-admin-list__create-btn">
          + Dodaj nowe
        </a>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po nazwisku, telefonie lub e-mailu"
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
        {TYPE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleTypeFilter(value)}
            className={"black-admin-list__filter-btn" + (typeFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__divider" />
      {error && <div className="black-admin-list__error">{error}</div>}

      {loading ? (
        <div className="black-admin-list__loading">Ładowanie…</div>
      ) : docs.length === 0 ? (
        <div className="black-admin-list__empty">Brak zapytań spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Rodzaj</th>
                <th>Data</th>
                <th>Kontakt</th>
                <th>Telefon</th>
                <th>Osób</th>
                <th>Status</th>
                <th>Płatność</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>{TYPE_LABELS[r.type ?? ""] ?? r.type ?? "—"}</td>
                  <td>{formatDateTime(r.date, r.startHour, r.startMinute)}</td>
                  <td>{r.name || <span className="black-admin-list__muted">—</span>}</td>
                  <td>{r.phone || <span className="black-admin-list__muted">—</span>}</td>
                  <td>{r.people != null ? r.people : <span className="black-admin-list__muted">—</span>}</td>
                  <td>
                    <span className={`black-admin-list__status black-admin-list__status--${r.status ?? "new"}`}>
                      {STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                    </span>
                  </td>
                  <td>
                    {(() => { const p = getPaymentStatus(r.payment); return (
                      <span className={`black-admin-list__payment black-admin-list__payment--${p.cls}`}>{p.label}</span>
                    )})()}
                  </td>
                  <td>
                    <a href={`/admin/collections/occasional-inquiries/${r.id}`} className="black-admin-list__action-link">
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
            Strona {page} z {totalPages} <span className="black-admin-list__muted">({totalDocs} zapytań)</span>
          </span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="black-admin-list__page-btn">
            Następna →
          </button>
        </div>
      )}

      {!loading && totalDocs > 0 && totalPages === 1 && (
        <div className="black-admin-list__count">{totalDocs} {totalDocs === 1 ? "zapytanie" : totalDocs < 5 ? "zapytania" : "zapytań"}</div>
      )}
    </div>
  )
}

export default OccasionalInquiriesListView
