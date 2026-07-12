"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type Resource = {
  id: string | number
  type?: string
  number?: number
  label?: string
  active?: boolean
  notes?: string
}

type ApiResult = { docs: Resource[]; totalDocs: number; totalPages: number; page: number }

type TypeFilter   = "all" | "lane" | "billiard"
type ActiveFilter = "all" | "active" | "inactive"

const TYPE_LABELS: Record<string, string> = {
  lane:     "Tor kręgli",
  billiard: "Stół bilardowy",
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all",      label: "Wszystkie" },
  { value: "lane",     label: "Tory kręgli" },
  { value: "billiard", label: "Stoły bilardowe" },
]

const ACTIVE_FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: "all",      label: "Wszystkie" },
  { value: "active",   label: "Aktywne" },
  { value: "inactive", label: "Nieaktywne" },
]

function buildApiUrl(search: string, typeFilter: TypeFilter, activeFilter: ActiveFilter, page: number, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "number", depth: "0" })
  const term = search.trim()
  let a = 0

  if (term) {
    params.set(`where[and][${a}][or][0][label][like]`, term)
    params.set(`where[and][${a}][or][1][notes][like]`, term)
    a++
  }
  if (typeFilter !== "all") {
    params.set(`where[and][${a}][type][equals]`, typeFilter); a++
  }
  if (activeFilter === "active") {
    params.set(`where[and][${a}][active][equals]`, "true"); a++
  } else if (activeFilter === "inactive") {
    params.set(`where[and][${a}][active][equals]`, "false"); a++
  }

  return `/api/resources?${params.toString()}`
}

const DEFAULT_LIMIT = 25

export function ResourcesListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Zasoby" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all")
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

      fetch(buildApiUrl(search, typeFilter, activeFilter, page, limit), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania zasobów.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, typeFilter, activeFilter, page, limit])

  const handleType   = (v: TypeFilter)   => { setPage(1); setTypeFilter(v) }
  const handleActive = (v: ActiveFilter) => { setPage(1); setActiveFilter(v) }
  const handleSearch = (val: string)     => { setSearch(val); setPage(1) }
  const handleLimit  = (v: number)       => { setLimit(v); setPage(1) }

  const docs       = data?.docs ?? []
  const totalDocs  = data?.totalDocs ?? 0
  const totalPages = data?.totalPages ?? 1
  const fromRow    = totalDocs === 0 ? 0 : (page - 1) * limit + 1
  const toRow      = Math.min(page * limit, totalDocs)

  return (
    <div className="black-admin-list">
      <div className="black-admin-list__header">
        <h1 className="black-admin-list__title">Zasoby</h1>
        <a href="/admin/collections/resources/create" className="black-admin-list__create-btn">
          + Dodaj zasób
        </a>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text" value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po etykiecie lub uwagach"
          className="black-admin-list__search-input"
        />
      </div>

      <div className="black-admin-list__filters">
        {TYPE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleType(value)}
            className={"black-admin-list__filter-btn" + (typeFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__filters black-admin-list__filters--types">
        {ACTIVE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleActive(value)}
            className={"black-admin-list__filter-btn" + (activeFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__divider" />
      {error && <div className="black-admin-list__error">{error}</div>}

      {loading ? (
        <div className="black-admin-list__loading">Ładowanie…</div>
      ) : docs.length === 0 ? (
        <div className="black-admin-list__empty">Brak zasobów spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Typ</th>
                <th>Numer</th>
                <th>Etykieta</th>
                <th>Status</th>
                <th>Uwagi</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>{TYPE_LABELS[r.type ?? ""] ?? r.type ?? "—"}</td>
                  <td>{r.number ?? <span className="black-admin-list__muted">—</span>}</td>
                  <td>{r.label || <span className="black-admin-list__muted">—</span>}</td>
                  <td>
                    <span className={`black-admin-list__status black-admin-list__status--${r.active ? "confirmed" : "cancelled"}`}>
                      {r.active ? "Aktywny" : "Nieaktywny"}
                    </span>
                  </td>
                  <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.notes || <span className="black-admin-list__muted">—</span>}
                  </td>
                  <td>
                    <a href={`/admin/collections/resources/${r.id}`} className="black-admin-list__action-link">
                      Otwórz →
                    </a>
                  </td>
                </tr>
              ))}
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

export default ResourcesListView
