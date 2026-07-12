"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth, useStepNav } from "@payloadcms/ui"

type User = {
  id: string | number
  email?: string
  role?: string
  createdAt?: string
  updatedAt?: string
}

type ApiResult = { docs: User[]; totalDocs: number; totalPages: number; page: number }

type RoleFilter = "all" | "admin" | "staff"

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  staff: "Obsługa",
}

const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Obsługa" },
]

function buildApiUrl(search: string, roleFilter: RoleFilter, page: number, limit: number): string {
  const params = new URLSearchParams({ limit: String(limit), page: String(page), sort: "-updatedAt", depth: "0" })
  const term = search.trim()
  let a = 0

  if (term) {
    params.set(`where[and][${a}][or][0][email][like]`, term)
    a++
  }
  if (roleFilter !== "all") {
    params.set(`where[and][${a}][role][equals]`, roleFilter)
    a++
  }

  return `/api/users?${params.toString()}`
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

export function UsersListView() {
  const { token } = useAuth()
  const { setStepNav } = useStepNav()

  useEffect(() => { setStepNav([{ label: "Użytkownicy" }]) }, [setStepNav])

  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
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

      fetch(buildApiUrl(search, roleFilter, page, limit), {
        headers: { Authorization: `JWT ${token}` },
        signal: controller.signal,
      })
        .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json() })
        .then((json: ApiResult) => setData(json))
        .catch((e) => { if (e.name !== "AbortError") setError("Błąd podczas ładowania użytkowników.") })
        .finally(() => setLoading(false))
    }, delay)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, search, roleFilter, page, limit])

  const handleRole   = (v: RoleFilter) => { setPage(1); setRoleFilter(v) }
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
        <h1 className="black-admin-list__title">Użytkownicy</h1>
        <a href="/admin/collections/users/create" className="black-admin-list__create-btn">
          + Dodaj użytkownika
        </a>
      </div>

      <div className="black-admin-list__search">
        <input
          type="text" value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Szukaj po e-mailu lub roli"
          className="black-admin-list__search-input"
        />
      </div>

      <div className="black-admin-list__filters">
        {ROLE_FILTERS.map(({ value, label }) => (
          <button key={value} type="button" onClick={() => handleRole(value)}
            className={"black-admin-list__filter-btn" + (roleFilter === value ? " black-admin-list__filter-btn--active" : "")}>
            {label}
          </button>
        ))}
      </div>

      <div className="black-admin-list__divider" />
      {error && <div className="black-admin-list__error">{error}</div>}

      {loading ? (
        <div className="black-admin-list__loading">Ładowanie…</div>
      ) : docs.length === 0 ? (
        <div className="black-admin-list__empty">Brak użytkowników spełniających kryteria.</div>
      ) : (
        <div className="black-admin-list__table-wrap">
          <table className="black-admin-list__table">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Rola</th>
                <th>Ostatnia aktualizacja</th>
                <th>Utworzono</th>
                <th aria-label="Akcje" />
              </tr>
            </thead>
            <tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td>{r.email || <span className="black-admin-list__muted">—</span>}</td>
                  <td>
                    <span className={`black-admin-list__status black-admin-list__status--${r.role === "admin" ? "confirmed" : "new"}`}>
                      {ROLE_LABELS[r.role ?? ""] ?? r.role ?? "—"}
                    </span>
                  </td>
                  <td>{formatDate(r.updatedAt)}</td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <a href={`/admin/collections/users/${r.id}`} className="black-admin-list__action-link">
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

export default UsersListView
