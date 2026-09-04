"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type ResCustomer = { firstName?: string; lastName?: string }
type ResDoc = { id: string | number; type?: string; reservationNumber?: string; customer?: ResCustomer }

type Payment = {
  id: string | number
  status?: string
  amount?: number
  p24SessionId?: string
  createdAt?: string
  reservation?: ResDoc | null
}

type ApiResult = { docs: Payment[]; totalDocs: number; totalPages: number; page: number }

type StatusFilter = "all" | "pending" | "paid" | "failed" | "expired" | "refunded"
type DateFilter = "all" | "today" | "yesterday" | "week" | "custom"
type TypeFilter = "all" | "kregle" | "bilard" | "impreza" | "biznes"

const STATUS_LABELS: Record<string, string> = {
  pending: "Oczekuje",
  paid: "Opłacone",
  failed: "Nieudane",
  expired: "Wygasła",
  refunded: "Zwrócone",
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "pending", label: "Oczekuje" },
  { value: "paid", label: "Opłacone" },
  { value: "failed", label: "Nieudane" },
  { value: "expired", label: "Wygasłe" },
  { value: "refunded", label: "Zwrócone" },
]

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Wszystkie daty" },
  { value: "today", label: "Dzisiaj" },
  { value: "yesterday", label: "Wczoraj" },
  { value: "week", label: "Ten tydzień" },
  { value: "custom", label: "Wybierz datę" },
]

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "kregle", label: "Kręgle" },
  { value: "bilard", label: "Bilard" },
  { value: "impreza", label: "Imprezy" },
  { value: "biznes", label: "Biznes" },
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
  if (filter === "yesterday") {
    const y = new Date(now); y.setDate(now.getDate() - 1)
    const t = toWarsawDate(y)
    return { from: `${t}T00:00:00.000Z`, to: `${t}T23:59:59.999Z` }
  }
  if (filter === "week") {
    const day = now.getDay()
    const diffToMon = day === 0 ? -6 : 1 - day
    const mon = new Date(now); mon.setDate(now.getDate() + diffToMon)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    return { from: `${toWarsawDate(mon)}T00:00:00.000Z`, to: `${toWarsawDate(sun)}T23:59:59.999Z` }
  }
  if (filter === "custom" && customDate) {
    return { from: `${customDate}T00:00:00.000Z`, to: `${customDate}T23:59:59.999Z` }
  }
  return { from: "", to: "" }
}

function buildApiUrl(
  search: string, statusFilter: StatusFilter, dateFilter: DateFilter, customDate: string,
  typeFilter: TypeFilter, page: number, limit: number,
): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "-createdAt", depth: "1" })
  const term = search.trim()
  const { from, to } = getDateRange(dateFilter, customDate)
  let a = 0

  if (term) {
    params.set(`where[and][${a}][p24SessionId][like]`, term)
    a++
  }
  if (statusFilter !== "all") {
    params.set(`where[and][${a}][status][equals]`, statusFilter)
    a++
  }
  if (from) { params.set(`where[and][${a}][createdAt][greater_than_equal]`, from); a++ }
  if (to)   { params.set(`where[and][${a}][createdAt][less_than_equal]`, to);    a++ }
  if (typeFilter !== "all") {
    params.set(`where[and][${a}][reservation.type][equals]`, typeFilter)
    a++
  }

  return `/api/payments?${params.toString()}`
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Warsaw",
    })
  } catch { return "—" }
}

function formatAmount(amount: number | undefined): string {
  if (amount == null) return "—"
  return `${amount} zł`
}

const DEFAULT_LIMIT = 25

export function PaymentsListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Płatności" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")
  const [customDate, setCustomDate] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
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
      setLoading(true); setError("")

      fetch(buildApiUrl(search, statusFilter, dateFilter, customDate, typeFilter, page, limit), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania płatności.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, statusFilter, dateFilter, customDate, typeFilter, page, limit])

  const handleStatus  = (v: StatusFilter) => { setPage(1); setStatusFilter(v) }
  const handleDate    = (v: DateFilter)   => { setPage(1); setDateFilter(v); if (v !== "custom") setCustomDate("") }
  const handleType    = (v: TypeFilter)   => { setPage(1); setTypeFilter(v) }
  const handleSearch  = (val: string)     => { setSearch(val); setPage(1) }
  const handleLimit   = (v: number)       => { setLimit(v); setPage(1) }

  const docs       = data?.docs ?? []
  const totalDocs  = data?.totalDocs ?? 0
  const totalPages = data?.totalPages ?? 1
  const fromRow    = totalDocs === 0 ? 0 : (page - 1) * limit + 1
  const toRow      = Math.min(page * limit, totalDocs)

  return (
    <div className="black-admin-list">
      <div className="black-admin-list__header">
        <h1 className="black-admin-list__title">Płatności</h1>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text" value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po identyfikatorze P24"
          className="black-admin-list__search-input"
        />
      </div>

      <div className="black-admin-list__filters">
        {DATE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleDate(value)}
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
        {STATUS_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleStatus(value)}
            className={"black-admin-list__filter-btn" + (statusFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__filters black-admin-list__filters--types">
        {TYPE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleType(value)}
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
        <div className="black-admin-list__empty">Brak płatności spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Status</th>
                <th>Kwota</th>
                <th>Klient</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => {
                const res = r.reservation && typeof r.reservation === "object" ? r.reservation : null
                const cust = res?.customer
                const clientName = cust ? `${cust.firstName ?? ""} ${cust.lastName ?? ""}`.trim() : ""
                return (
                  <tr key={r.id}>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>
                      <span className={`black-admin-list__payment black-admin-list__payment--${r.status ?? "pending"}`}>
                        {STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                      </span>
                    </td>
                    <td>{formatAmount(r.amount)}</td>
                    <td>{clientName || <span className="black-admin-list__muted">—</span>}</td>
                    <td>
                      <a href={`/admin/collections/payments/${r.id}`} className="black-admin-list__action-link">
                        Otwórz →
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="black-admin-list__pagination">
        <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className="black-admin-list__page-btn">
          ← Poprzednia
        </button>
        <span className="black-admin-list__pagination-info">
          {totalDocs === 0 ? "Brak wyników" : `${fromRow}–${toRow} z ${totalDocs}`}
        </span>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages} className="black-admin-list__page-btn">
          Następna →
        </button>
      </div>
      <div className="black-admin-list__per-page-row">
        <label className="black-admin-list__per-page-label">
          <select className="black-admin-list__per-page" value={limit} onChange={(e) => handleLimit(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          {" "}na stronę
        </label>
      </div>
    </div>
  )
}

export default PaymentsListView
