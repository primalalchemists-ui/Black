"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useFormFields, useAuth, useDocumentInfo } from "@payloadcms/ui"

type Resource = { id: string | number; number: number; label?: string | null }

interface ResourceTime {
  startHour: string
  endHour: string
}

const DEFAULT_TIME: ResourceTime = { startHour: "19", endHour: "21" }

const HOUR_OPTS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}))

export function BowlingResourcePicker() {
  const { token } = useAuth()
  const { id: docId } = useDocumentInfo()

  const [typeVal, dispatch] = useFormFields(([fields, d]) => [
    fields.type?.value as string | undefined,
    d,
  ] as const)

  const resourceType = typeVal === "kregle" ? "lane" : typeVal === "bilard" ? "billiard" : null

  const [allResources, setAllResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [times, setTimes] = useState<Map<string, ResourceTime>>(new Map())

  // Track current type so we can reset on change
  const prevTypeRef = useRef<string | undefined>(typeVal)
  // Track that init already ran for this type+doc combination
  const initDoneRef = useRef(false)

  // Reset state when reservation type changes
  useEffect(() => {
    if (prevTypeRef.current === typeVal) return
    prevTypeRef.current = typeVal
    setSelectedIds(new Set())
    setTimes(new Map())
    setAllResources([])
    initDoneRef.current = false
  }, [typeVal])

  // Fetch available resources when type changes
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

  // Initialize state once resources are loaded.
  // In edit mode: fetch the document from the API to read existing segments.
  // In create mode: start empty.
  useEffect(() => {
    if (allResources.length === 0 || !token || initDoneRef.current) return
    initDoneRef.current = true

    if (!docId) {
      // Create mode — empty state, user selects via toggles
      return
    }

    // Edit mode — fetch existing document at depth=0 (IDs only)
    fetch(`/api/reservations/${docId}?depth=0`, {
      headers: { Authorization: `JWT ${token}` },
    })
      .then((r) => r.json())
      .then((doc) => {
        const segs: any[] = Array.isArray(doc.segments) ? doc.segments : []
        const resources: any[] = Array.isArray(doc.resources) ? doc.resources : []

        const newTimes = new Map<string, ResourceTime>()
        const newSelected = new Set<string>()

        if (segs.length > 0) {
          for (const seg of segs) {
            const res = seg.resource
            const resId = res == null ? "" : typeof res === "object" ? String(res.id ?? "") : String(res)
            if (!resId) continue
            newSelected.add(resId)
            newTimes.set(resId, {
              startHour: String(seg.startHour ?? DEFAULT_TIME.startHour),
              endHour: String(seg.endHour ?? DEFAULT_TIME.endHour),
            })
          }
        } else {
          for (const res of resources) {
            const resId = res == null ? "" : typeof res === "object" ? String(res.id ?? "") : String(res)
            if (!resId) continue
            newSelected.add(resId)
            newTimes.set(resId, { ...DEFAULT_TIME })
          }
        }

        setSelectedIds(newSelected)
        setTimes(newTimes)
      })
      .catch(() => {
        // On error, stay with empty state
      })
  }, [allResources, docId, token])

  const dispatchBoth = useCallback(
    (nextSelected: Set<string>, nextTimes: Map<string, ResourceTime>) => {
      const arr = [...nextSelected]
      ;(dispatch as any)({ type: "UPDATE", path: "resources", value: arr, valid: arr.length > 0 })
      const segments = arr.map((resId) => {
        const t = nextTimes.get(resId) ?? DEFAULT_TIME
        return {
          resource: resId,
          startHour: Number(t.startHour),
          startMinute: 0,
          endHour: Number(t.endHour),
          endMinute: 0,
          price: 0,
        }
      })
      ;(dispatch as any)({ type: "UPDATE", path: "segments", value: segments, valid: true })
    },
    [dispatch],
  )

  const handleToggle = useCallback(
    (id: string) => {
      const next = new Set(selectedIds)
      let nextTimes = times
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        if (!times.has(id)) {
          nextTimes = new Map(times)
          nextTimes.set(id, { ...DEFAULT_TIME })
          setTimes(nextTimes)
        }
      }
      setSelectedIds(next)
      dispatchBoth(next, nextTimes)
    },
    [selectedIds, times, dispatchBoth],
  )

  const handleTimeChange = useCallback(
    (resourceId: string, field: keyof ResourceTime, value: string) => {
      const nextTimes = new Map(times)
      const existing = nextTimes.get(resourceId) ?? { ...DEFAULT_TIME }
      nextTimes.set(resourceId, { ...existing, [field]: value })
      setTimes(nextTimes)
      dispatchBoth(selectedIds, nextTimes)
    },
    [times, selectedIds, dispatchBoth],
  )

  if (!resourceType) return null

  const typeLabel = typeVal === "kregle" ? "Tory kręgli" : "Stoły bilardowe"
  const singular = typeVal === "kregle" ? "Tor" : "Stół"
  const timesHeading = typeVal === "kregle" ? "Godziny per tor" : "Godziny per stół"
  const selectedResources = allResources.filter((r) => selectedIds.has(String(r.id)))

  return (
    <div className="brp">
      <div className="brp__heading">{typeLabel}</div>

      {loading ? (
        <p className="brp__hint">Ładowanie zasobów…</p>
      ) : allResources.length === 0 ? (
        <p className="brp__hint">Brak aktywnych zasobów tego typu.</p>
      ) : (
        <>
          {/* Resource toggle buttons */}
          <div className="brp__grid">
            {allResources.map((r) => {
              const id = String(r.id)
              const checked = selectedIds.has(id)
              const name = r.label || `${singular} ${r.number}`
              return (
                <label key={id} className={`brp__item${checked ? " brp__item--on" : ""}`}>
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

          {/* Per-resource time inputs */}
          {selectedResources.length > 0 && (
            <div className="brp__times-table">
              <div className="brp__times-head">{timesHeading}</div>
              {selectedResources.map((r) => {
                const id = String(r.id)
                const name = r.label || `${singular} ${r.number}`
                const t = times.get(id) ?? { ...DEFAULT_TIME }
                return (
                  <div key={id} className="brp__time-row">
                    <span className="brp__time-name">{name}</span>
                    <div className="brp__time-inputs">
                      <span className="brp__time-sep">Od</span>
                      <select
                        aria-label={`${name} — godzina start`}
                        className="brp__sel"
                        value={t.startHour}
                        onChange={(e) => handleTimeChange(id, "startHour", e.target.value)}
                      >
                        {HOUR_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <span className="brp__time-sep">Do</span>
                      <select
                        aria-label={`${name} — godzina koniec`}
                        className="brp__sel"
                        value={t.endHour}
                        onChange={(e) => handleTimeChange(id, "endHour", e.target.value)}
                      >
                        {HOUR_OPTS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
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
        </>
      )}
    </div>
  )
}

export default BowlingResourcePicker
