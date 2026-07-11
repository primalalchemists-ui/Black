"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

// ─── Types ────────────────────────────────────────────────────────────────────

type Customer = {
  firstName?: string
  lastName?: string
  phone?: string
  email?: string
}

type Invoice = {
  wantInvoice?: boolean
  invoiceType?: "personal" | "company"
  nip?: string
}

type Reservation = {
  id: string | number
  type?: string
  reservationNumber?: string
  day?: string
  startHour?: string | number
  startMinute?: string | number
  startsAt?: string
  customer?: Customer
  status?: string
  paymentStatus?: string
  partySize?: number
  notes?: string
  invoice?: Invoice
}

type ApiResult = {
  docs: Reservation[]
  totalDocs: number
  totalPages: number
  page: number
}

type TypeFilter = "all" | "stolik" | "kregle" | "bilard" | "biznes" | "impreza"
type DateFilter = "all" | "today" | "tomorrow" | "weekend" | "custom"

// ─── Labels ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  stolik: "Stolik",
  kregle: "Kręgle",
  bilard: "Bilard",
  biznes: "Biznes",
  impreza: "Impreza",
}

const STATUS_LABELS: Record<string, string> = {
  new: "Nowe",
  confirmed: "Potwierdzone",
  cancelled: "Anulowane",
  no_show: "Nie przybyło",
  completed: "Zakończone",
}

const PAYMENT_LABELS: Record<string, string> = {
  not_required: "—",
  pending: "Oczekuje",
  paid: "Opłacone",
  failed: "Nieudane",
  refunded: "Zwrócono",
  forfeited: "Przepadło",
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "stolik", label: "Stoliki" },
  { value: "kregle", label: "Kręgle" },
  { value: "bilard", label: "Bilard" },
  { value: "biznes", label: "Biznes" },
  { value: "impreza", label: "Imprezy" },
]

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Wszystkie daty" },
  { value: "today", label: "Dzisiaj" },
  { value: "tomorrow", label: "Jutro" },
  { value: "weekend", label: "Ten weekend" },
  { value: "custom", label: "Wybierz datę" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    const day = now.getDay() // 0=Sun, 6=Sat
    const toSat = day === 6 ? 0 : (6 - day + 7) % 7 || 7
    const sat = new Date(now)
    sat.setDate(now.getDate() + toSat)
    const sun = new Date(sat)
    sun.setDate(sat.getDate() + 1)
    return {
      from: `${toWarsawDate(sat)}T00:00:00.000Z`,
      to: `${toWarsawDate(sun)}T23:59:59.999Z`,
    }
  }

  if (filter === "custom" && customDate) {
    return { from: `${customDate}T00:00:00.000Z`, to: `${customDate}T23:59:59.999Z` }
  }

  return { from: "", to: "" }
}

function buildApiUrl(
  search: string,
  typeFilter: TypeFilter,
  dateFilter: DateFilter,
  customDate: string,
  page: number,
  limit: number,
): string {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    sort: "-day",
    depth: "0",
    // exclude hasMany relation fields to prevent SQL JOIN duplicates
    "select[resources]": "false",
  })

  const term = search.trim()
  const { from, to } = getDateRange(dateFilter, customDate)
  let a = 0

  if (term) {
    ;["customer.firstName", "customer.lastName", "customer.phone", "customer.email", "reservationNumber"].forEach(
      (field, i) => {
        params.set(`where[and][${a}][or][${i}][${field}][like]`, term)
      },
    )
    a++
  }

  if (typeFilter !== "all") {
    params.set(`where[and][${a}][type][equals]`, typeFilter)
    a++
  }

  if (from) {
    params.set(`where[and][${a}][day][greater_than_equal]`, from)
    a++
  }

  if (to) {
    params.set(`where[and][${a}][day][less_than_equal]`, to)
    a++
  }

  return `/api/reservations?${params.toString()}`
}

function formatDateTime(day: string | undefined, startHour: string | number | undefined, startMinute: string | number | undefined): string {
  if (!day) return "—"
  try {
    const date = new Date(day)
    const datePart = date.toLocaleDateString("pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Warsaw",
    })
    if (startHour != null && startMinute != null) {
      const h = String(startHour).padStart(2, "0")
      const m = String(startMinute).padStart(2, "0")
      return `${datePart}, ${h}:${m}`
    }
    return datePart
  } catch {
    return "—"
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────

const LIMIT = 20

export function ReservationsListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  // Ustaw breadcrumb natychmiast po załadowaniu widoku
  useEffect(() => {
    setStepNav([{ label: "Rezerwacje" }])
  }, [setStepNav])

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

  // Debounce search; immediate for other state changes
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

      const url = buildApiUrl(search, typeFilter, dateFilter, customDate, page, LIMIT)
      fetch(url, {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((json: ApiResult) => {
          // Deduplicate by ID — hasMany relations (resources) can cause SQL JOIN
          // to return duplicate rows when a reservation has multiple resources
          const seen = new Set<string | number>()
          const dedupedDocs = json.docs.filter(r => {
            if (seen.has(r.id)) return false
            seen.add(r.id)
            return true
          })
          setData({ ...json, docs: dedupedDocs })
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError("Błąd podczas ładowania rezerwacji.")
        })
        .finally(() => {
          setLoading(false)
        })
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, typeFilter, dateFilter, customDate, page])

  const handleTypeFilter = (t: TypeFilter) => {
    setPage(1)
    setTypeFilter(t)
  }

  const handleDateFilter = (d: DateFilter) => {
    setPage(1)
    setDateFilter(d)
    if (d !== "custom") setCustomDate("")
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    setPage(1)
  }

  const docs = data?.docs ?? []
  const totalDocs = data?.totalDocs ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="black-admin-list">
      {/* Header */}
      <div className="black-admin-list__header">
        <h1 className="black-admin-list__title">Rezerwacje</h1>
        <a href="/admin/collections/reservations/create" className="black-admin-list__create-btn">
          + Dodaj nową
        </a>
      </div>

      {/* Search */}
      <div className="black-admin-list__search">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po imieniu, nazwisku, telefonie, e-mailu lub numerze rezerwacji"
          className="black-admin-list__search-input"
        />
      </div>

      {/* Date filter buttons */}
      <div className="black-admin-list__filters">
        {DATE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleDateFilter(value)}
            className={
              "black-admin-list__filter-btn" +
              (dateFilter === value ? " black-admin-list__filter-btn--active" : "")
            }
          >
            {label}
          </button>
        ))}
        {dateFilter === "custom" && (
          <input
            type="date"
            aria-label="Wybierz datę"
            value={customDate}
            onChange={(e) => {
              setCustomDate(e.target.value)
              setPage(1)
            }}
            className="black-admin-list__date-input"
          />
        )}
      </div>

      {/* Type filter buttons */}
      <div className="black-admin-list__filters black-admin-list__filters--types">
        {TYPE_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleTypeFilter(value)}
            className={
              "black-admin-list__filter-btn" +
              (typeFilter === value ? " black-admin-list__filter-btn--active" : "")
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="black-admin-list__divider" />

      {/* Error */}
      {error && <div className="black-admin-list__error">{error}</div>}

      {/* Table */}
      {loading ? (
        <div className="black-admin-list__loading">Ładowanie…</div>
      ) : docs.length === 0 ? (
        <div className="black-admin-list__empty">Brak rezerwacji spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Numer</th>
                <th>Typ</th>
                <th>Data i godzina</th>
                <th>Klient</th>
                <th>Telefon</th>
                <th>Status</th>
                <th>Płatność</th>
                <th>Faktura</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="black-admin-list__reservation-number">
                      {r.reservationNumber || <span className="black-admin-list__muted">—</span>}
                    </span>
                  </td>
                  <td>{TYPE_LABELS[r.type ?? ""] ?? r.type ?? "—"}</td>
                  <td>{formatDateTime(r.day, r.startHour, r.startMinute)}</td>
                  <td>
                    {r.customer?.firstName} {r.customer?.lastName}
                  </td>
                  <td>{r.customer?.phone ?? "—"}</td>
                  <td>
                    <span
                      className={`black-admin-list__status black-admin-list__status--${r.status ?? "new"}`}
                    >
                      {STATUS_LABELS[r.status ?? ""] ?? r.status ?? "—"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`black-admin-list__payment black-admin-list__payment--${r.paymentStatus ?? "not_required"}`}
                    >
                      {PAYMENT_LABELS[r.paymentStatus ?? ""] ?? r.paymentStatus ?? "—"}
                    </span>
                  </td>
                  <td>
                    {r.invoice?.wantInvoice ? (
                      <span className="black-admin-list__invoice black-admin-list__invoice--yes">
                        {r.invoice.invoiceType === "company" ? `Firma${r.invoice.nip ? ` · ${r.invoice.nip}` : ""}` : "Osoba"}
                      </span>
                    ) : (
                      <span className="black-admin-list__muted">—</span>
                    )}
                  </td>
                  <td>
                    <a
                      href={`/admin/collections/reservations/${r.id}`}
                      className="black-admin-list__action-link"
                    >
                      Otwórz →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="black-admin-list__pagination">
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="black-admin-list__page-btn"
          >
            ← Poprzednia
          </button>
          <span className="black-admin-list__pagination-info">
            Strona {page} z {totalPages}{" "}
            <span className="black-admin-list__muted">({totalDocs} rezerwacji)</span>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
            className="black-admin-list__page-btn"
          >
            Następna →
          </button>
        </div>
      )}

      {!loading && totalDocs > 0 && totalPages === 1 && (
        <div className="black-admin-list__count">
          {totalDocs} {totalDocs === 1 ? "rezerwacja" : totalDocs < 5 ? "rezerwacje" : "rezerwacji"}
        </div>
      )}
    </div>
  )
}

export default ReservationsListView
