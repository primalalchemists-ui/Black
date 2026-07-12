"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type MenuItem = {
  id: string | number
  name?: string
  price?: number
  order?: number
  active?: boolean
  updatedAt?: string
  category?: { id: string | number; name?: string } | string | number | null
}

type Category = { id: string | number; name?: string }

type ApiResult = { docs: MenuItem[]; totalDocs: number; totalPages: number; page: number }

type ActiveFilter  = "all" | "active" | "inactive"
type PriceFilter   = "all" | "lt20" | "20to50" | "50to150" | "gt150"
type CatFilter     = "all" | string

const ACTIVE_FILTERS: { value: ActiveFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "active", label: "Aktywne" },
  { value: "inactive", label: "Nieaktywne" },
]

const PRICE_FILTERS: { value: PriceFilter; label: string }[] = [
  { value: "all", label: "Wszystkie ceny" },
  { value: "lt20", label: "Do 20 zł" },
  { value: "20to50", label: "20–50 zł" },
  { value: "50to150", label: "50–150 zł" },
  { value: "gt150", label: "Powyżej 150 zł" },
]

function buildApiUrl(
  search: string, catFilter: CatFilter, activeFilter: ActiveFilter,
  priceFilter: PriceFilter, page: number, limit: number,
): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "order", depth: "1" })
  const term = search.trim()
  let a = 0

  if (term) {
    params.set(`where[and][${a}][name][like]`, term)
    a++
  }
  if (catFilter !== "all") {
    params.set(`where[and][${a}][category][equals]`, catFilter)
    a++
  }
  if (activeFilter === "active") {
    params.set(`where[and][${a}][active][equals]`, "true"); a++
  } else if (activeFilter === "inactive") {
    params.set(`where[and][${a}][active][equals]`, "false"); a++
  }
  if (priceFilter === "lt20") {
    params.set(`where[and][${a}][price][less_than_equal]`, "20"); a++
  } else if (priceFilter === "20to50") {
    params.set(`where[and][${a}][price][greater_than]`, "20"); a++
    params.set(`where[and][${a}][price][less_than_equal]`, "50"); a++
  } else if (priceFilter === "50to150") {
    params.set(`where[and][${a}][price][greater_than]`, "50"); a++
    params.set(`where[and][${a}][price][less_than_equal]`, "150"); a++
  } else if (priceFilter === "gt150") {
    params.set(`where[and][${a}][price][greater_than]`, "150"); a++
  }

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

function formatPrice(price: number | undefined): string {
  if (price == null) return "—"
  return `${price} zł`
}

function getCategoryName(cat: MenuItem["category"]): string {
  if (!cat) return "—"
  if (typeof cat === "object" && "name" in cat) return cat.name ?? "—"
  return "—"
}

const DEFAULT_LIMIT = 25

export function MenuItemsListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Pozycje menu" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState<CatFilter>("all")
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all")
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all")
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [data, setData] = useState<ApiResult | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Load categories once
  useEffect(() => {
    if (!token) return
    fetch("/api/menu-categories?limit=100&sort=order&depth=0", {
      headers: { Authorization: `JWT ${token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((json) => { if (json?.docs) setCategories(json.docs) })
      .catch(() => {})
  }, [token])

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

      fetch(buildApiUrl(search, catFilter, activeFilter, priceFilter, page, limit), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania pozycji menu.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, catFilter, activeFilter, priceFilter, page, limit])

  const handleCat    = (v: CatFilter)    => { setPage(1); setCatFilter(v) }
  const handleActive = (v: ActiveFilter) => { setPage(1); setActiveFilter(v) }
  const handlePrice  = (v: PriceFilter)  => { setPage(1); setPriceFilter(v) }
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
        <h1 className="black-admin-list__title">Pozycje menu</h1>
        <a href="/admin/collections/menu-items/create" className="black-admin-list__create-btn">
          + Dodaj pozycję
        </a>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text" value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po nazwie pozycji"
          className="black-admin-list__search-input"
        />
      </div>

      {/* Category filter */}
      <div className="black-admin-list__filters">
        <button type="button" onClick={() => handleCat("all")}
          className={"black-admin-list__filter-btn" + (catFilter === "all" ? " black-admin-list__filter-btn--active" : "")}>
          Wszystkie
        </button>
        {categories.map((cat) => (
          <button key={cat.id} type="button" onClick={() => handleCat(String(cat.id))}
            className={"black-admin-list__filter-btn" + (catFilter === String(cat.id) ? " black-admin-list__filter-btn--active" : "")}>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Active filter */}
      <div className="black-admin-list__filters black-admin-list__filters--types">
        {ACTIVE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleActive(value)}
            className={"black-admin-list__filter-btn" + (activeFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      {/* Price filter */}
      <div className="black-admin-list__filters black-admin-list__filters--types">
        {PRICE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handlePrice(value)}
            className={"black-admin-list__filter-btn" + (priceFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__divider" />
      {error && <div className="black-admin-list__error">{error}</div>}

      {loading ? (
        <div className="black-admin-list__loading">Ładowanie…</div>
      ) : docs.length === 0 ? (
        <div className="black-admin-list__empty">Brak pozycji spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Kategoria</th>
                <th>Cena</th>
                <th>Status</th>
                <th>Kolejność</th>
                <th>Zaktualizowano</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || <span className="black-admin-list__muted">—</span>}</td>
                  <td>{getCategoryName(r.category)}</td>
                  <td>{formatPrice(r.price)}</td>
                  <td>
                    <span className={`black-admin-list__status black-admin-list__status--${r.active ? "confirmed" : "cancelled"}`}>
                      {r.active ? "Aktywna" : "Nieaktywna"}
                    </span>
                  </td>
                  <td>{r.order ?? <span className="black-admin-list__muted">—</span>}</td>
                  <td>{formatDate(r.updatedAt)}</td>
                  <td>
                    <a href={`/admin/collections/menu-items/${r.id}`} className="black-admin-list__action-link">
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

export default MenuItemsListView
