"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type MediaDoc = {
  id: string | number
  filename?: string
  url?: string
  mimeType?: string
  alt?: string
  createdAt?: string
  updatedAt?: string
  width?: number
  height?: number
}

type ApiResult = { docs: MediaDoc[]; totalDocs: number; totalPages: number; page: number }

type TypeFilter = "all" | "images" | "pdf" | "other"
type DateFilter = "all" | "today" | "week" | "custom"

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "images", label: "Obrazy" },
  { value: "pdf", label: "PDF" },
  { value: "other", label: "Inne" },
]

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "Wszystkie daty" },
  { value: "today", label: "Dzisiaj" },
  { value: "week", label: "Ten tydzień" },
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
  search: string, typeFilter: TypeFilter, dateFilter: DateFilter, customDate: string,
  page: number, limit: number,
): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "-createdAt", depth: "0" })
  const term = search.trim()
  const { from, to } = getDateRange(dateFilter, customDate)
  let a = 0

  if (term) {
    params.set(`where[and][${a}][or][0][filename][like]`, term)
    params.set(`where[and][${a}][or][1][alt][like]`, term)
    a++
  }

  if (typeFilter === "images") {
    params.set(`where[and][${a}][mimeType][like]`, "image/")
    a++
  } else if (typeFilter === "pdf") {
    params.set(`where[and][${a}][mimeType][equals]`, "application/pdf")
    a++
  } else if (typeFilter === "other") {
    params.set(`where[and][${a}][mimeType][not_like]`, "image/")
    a++
    params.set(`where[and][${a}][mimeType][not_equals]`, "application/pdf")
    a++
  }

  if (from) { params.set(`where[and][${a}][createdAt][greater_than_equal]`, from); a++ }
  if (to)   { params.set(`where[and][${a}][createdAt][less_than_equal]`, to);    a++ }

  return `/api/media?${params.toString()}`
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Warsaw",
    })
  } catch { return "—" }
}

function getMimeLabel(mimeType: string | undefined): string {
  if (!mimeType) return "—"
  if (mimeType.startsWith("image/")) {
    const ext = mimeType.split("/")[1]?.toUpperCase() ?? "Obraz"
    return ext === "JPEG" ? "JPG" : ext
  }
  if (mimeType === "application/pdf") return "PDF"
  const ext = mimeType.split("/")[1]?.toUpperCase() ?? mimeType
  return ext
}

const DEFAULT_LIMIT = 25

export function MediaListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Media" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")
  const [customDate, setCustomDate] = useState("")
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

      fetch(buildApiUrl(search, typeFilter, dateFilter, customDate, page, limit), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania mediów.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, typeFilter, dateFilter, customDate, page, limit])

  const handleType   = (v: TypeFilter) => { setPage(1); setTypeFilter(v) }
  const handleDate   = (v: DateFilter) => { setPage(1); setDateFilter(v); if (v !== "custom") setCustomDate("") }
  const handleSearch = (val: string)   => { setSearch(val); setPage(1) }
  const handleLimit  = (v: number)     => { setLimit(v); setPage(1) }

  const docs       = data?.docs ?? []
  const totalDocs  = data?.totalDocs ?? 0
  const totalPages = data?.totalPages ?? 1
  const fromRow    = totalDocs === 0 ? 0 : (page - 1) * limit + 1
  const toRow      = Math.min(page * limit, totalDocs)

  return (
    <div className="black-admin-list">
      <div className="black-admin-list__header">
        <h1 className="black-admin-list__title">Media</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <a href="/admin/collections/media/create" className="black-admin-list__create-btn">
            + Dodaj nowe
          </a>
        </div>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text" value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po nazwie pliku lub tekście alternatywnym"
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
        <div className="black-admin-list__empty">Brak mediów spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Podgląd</th>
                <th>Nazwa pliku</th>
                <th>Typ</th>
                <th>Tekst alternatywny</th>
                <th>Zaktualizowano</th>
                <th>Utworzono</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => {
                const isImage = r.mimeType?.startsWith("image/")
                const isPdf   = r.mimeType === "application/pdf"
                return (
                  <tr key={r.id}>
                    <td>
                      {isImage && r.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.url} alt={r.alt ?? r.filename ?? ""} className="black-admin-list__thumb" />
                      ) : isPdf ? (
                        <span className="black-admin-list__thumb-placeholder">PDF</span>
                      ) : (
                        <span className="black-admin-list__thumb-placeholder">{getMimeLabel(r.mimeType).slice(0, 3)}</span>
                      )}
                    </td>
                    <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.filename || <span className="black-admin-list__muted">—</span>}
                    </td>
                    <td>{getMimeLabel(r.mimeType)}</td>
                    <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.alt || <span className="black-admin-list__muted">—</span>}
                    </td>
                    <td>{formatDate(r.updatedAt)}</td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>
                      <a href={`/admin/collections/media/${r.id}`} className="black-admin-list__action-link">
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

export default MediaListView
