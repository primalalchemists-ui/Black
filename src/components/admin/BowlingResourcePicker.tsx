"use client"

import { useEffect, useState, useCallback } from "react"
import { useFormFields, useAuth } from "@payloadcms/ui"

type Resource = {
  id: string | number
  number: number
  label?: string | null
}

function extractIds(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return (val as unknown[]).flatMap((r) => {
    if (!r) return []
    if (typeof r === "string" || typeof r === "number") return [String(r)]
    if (typeof r === "object") {
      const o = r as Record<string, unknown>
      if (o.id != null) return [String(o.id)]
      if (o.value != null) return [String(o.value)]
    }
    return []
  })
}

export function BowlingResourcePicker() {
  const { token } = useAuth()

  const [typeVal, resourcesVal, dispatch] = useFormFields(([fields, dispatch]) => [
    fields.type?.value as string | undefined,
    fields.resources?.value,
    dispatch,
  ] as const)

  const resourceType =
    typeVal === "kregle" ? "lane" : typeVal === "bilard" ? "billiard" : null

  const [allResources, setAllResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(false)

  const selectedIds = new Set<string>(extractIds(resourcesVal))

  useEffect(() => {
    if (!resourceType || !token) {
      setAllResources([])
      return
    }
    setLoading(true)
    fetch(
      `/api/resources?where[type][equals]=${resourceType}&where[active][equals]=true&limit=50&sort=number`,
      { headers: { Authorization: `JWT ${token}` } },
    )
      .then((r) => r.json())
      .then((data) => setAllResources(data?.docs ?? []))
      .catch(() => setAllResources([]))
      .finally(() => setLoading(false))
  }, [resourceType, token])

  const handleToggle = useCallback(
    (id: string) => {
      const next = new Set(selectedIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      ;(dispatch as any)({
        type: "UPDATE",
        path: "resources",
        value: [...next],
        valid: next.size > 0,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, dispatch],
  )

  if (!resourceType) return null

  const typeLabel = typeVal === "kregle" ? "Tory kręgli" : "Stoły bilardowe"
  const singular = typeVal === "kregle" ? "Tor" : "Stół"

  return (
    <div className="brp">
      <div className="brp__heading">{typeLabel}</div>

      {loading ? (
        <p className="brp__hint">Ładowanie zasobów…</p>
      ) : allResources.length === 0 ? (
        <p className="brp__hint">Brak aktywnych zasobów tego typu.</p>
      ) : (
        <div className="brp__grid">
          {allResources.map((r) => {
            const id = String(r.id)
            const checked = selectedIds.has(id)
            const name = r.label || `${singular} ${r.number}`
            return (
              <label
                key={id}
                className={`brp__item${checked ? " brp__item--on" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => handleToggle(id)}
                  className="brp__check"
                />
                <span>{name}</span>
              </label>
            )
          })}
        </div>
      )}

      {selectedIds.size > 0 && (
        <p className="brp__summary">
          Wybrano: <strong>{selectedIds.size}</strong>{" "}
          {selectedIds.size === 1
            ? typeVal === "kregle"
              ? "tor"
              : "stół"
            : selectedIds.size < 5
              ? typeVal === "kregle"
                ? "tory"
                : "stoły"
              : typeVal === "kregle"
                ? "torów"
                : "stołów"}
        </p>
      )}
    </div>
  )
}

export default BowlingResourcePicker
