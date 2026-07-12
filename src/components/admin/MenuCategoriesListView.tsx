"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type Category = {
  id: string | number
  name?: string
  order?: number
  active?: boolean
  updatedAt?: string
}

type ApiResult = { docs: Category[]; totalDocs: number; totalPages: number; page: number }

type ActiveFilter = "all" | "active" | "inactive"

const ACTIVE_FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "active", label: "Aktywne" },
  { value: "inactive", label: "Nieaktywne" },
]

function buildApiUrl(search: string, activeFilter: ActiveFilter, page: number, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "order", depth: "0" })
  const term = search.trim()
  let a = 0

  if (term) {
    params.set(`where[and][${a}][name][like]`, term)
    a++
  }
  if (activeFilter === "active") {
    params.set(`where[and][${a}][active][equals]`, "true")
    a++
  } else if (activeFilter === "inactive") {
    params.set(`where[and][${a}][active][equals]`, "false")
    a++
  }

  return `/api/menu-categories?${params.toString()}`
}

function buildCountUrl(categoryIds: (string | number)[]): string {
  const params = new URLSearchParams({ limit: "1000", depth: "0" })
  categoryIds.forEach((id, i) => {
    params.set(`where[or][${i}][category][equals]`, String(id))
  })
  return `/api/menu-items?${params.toString()}`
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("pl-PL", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Warsaw",
    })
  } catch { return "—" }
}

const DEFAULT_LIMIT = 25

export function MenuCategoriesListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Kategorie menu" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [data, setData] = useState<ApiResult | null>(null)
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({})
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

      fetch(buildApiUrl(search, activeFilter, page, limit), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then(async (json: ApiResult) => {
          setData(json)
          if (json.docs.length === 0) return
          // Fetch item counts for visible categories
          const ids = json.docs.map((d) => d.id)
          try {
            const countRes = await fetch(buildCountUrl(ids), { headers: { Authorization: `JWT ${token}` } })
            if (!countRes.ok) return
            const countJson = await countRes.json()
            const counts: Record<string, number> = {}
            ids.forEach((id) => { counts[String(id)] = 0 })
            ;(countJson.docs as any[]).forEach((item: any) => {
              const catId = String(typeof item.category === "object" ? (item.category?.id ?? item.category) : (item.category ?? ""))
              if (catId) counts[catId] = (counts[catId] ?? 0) + 1
            })
            setItemCounts(counts)
          } catch { /* counts remain 0 */ }
        })
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania kategorii.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, activeFilter, page, limit])

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
        <h1 className="black-admin-list__title">Kategorie menu</h1>
        <a href="/admin/collections/menu-categories/create" className="black-admin-list__create-btn">
          + Dodaj kategorię
        </a>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text" value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po nazwie kategorii"
          className="black-admin-list__search-input"
        />
      </div>

      <div className="black-admin-list__filters">
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
        <div className="black-admin-list__empty">Brak kategorii spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Kolejność</th>
                <th>Status</th>
                <th>Liczba pozycji</th>
                <th>Zaktualizowano</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || <span className="black-admin-list__muted">—</span>}</td>
                  <td>{r.order ?? <span className="black-admin-list__muted">—</span>}</td>
                  <td>
                    <span className={`black-admin-list__status black-admin-list__status--${r.active ? "confirmed" : "cancelled"}`}>
                      {r.active ? "Aktywna" : "Nieaktywna"}
                    </span>
                  </td>
                  <td>{itemCounts[String(r.id)] ?? <span className="black-admin-list__muted">—</span>}</td>
                  <td>{formatDate(r.updatedAt)}</td>
                  <td>
                    <a href={`/admin/collections/menu-categories/${r.id}`} className="black-admin-list__action-link">
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

export default MenuCategoriesListView
