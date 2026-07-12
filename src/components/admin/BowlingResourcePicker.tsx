"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useFormFields, useAuth } from "@payloadcms/ui"

type Resource = { id: string | number; number: number; label?: string | null }

interface ResourceTime {
  startHour: string
  startMinute: string
  endHour: string
  endMinute: string
}

const HOUR_OPTS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}))

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

function extractSegmentResource(seg: unknown): string | null {
  if (!seg || typeof seg !== "object") return null
  const s = seg as Record<string, unknown>
  const res = s.resource
  if (!res) return null
  if (typeof res === "string" || typeof res === "number") return String(res)
  if (typeof res === "object") {
    const r = res as Record<string, unknown>
    if (r.id != null) return String(r.id)
    if (r.value != null) return String(r.value)
  }
  return null
}

export function BowlingResourcePicker() {
  const { token } = useAuth()

  const [typeVal, resourcesVal, segmentsVal, startHourVal, startMinuteVal, endHourVal, endMinuteVal, dispatch] =
    useFormFields(([fields, d]) => [
      fields.type?.value as string | undefined,
      fields.resources?.value,
      fields.segments?.value,
      fields.startHour?.value as string | undefined,
      fields.startMinute?.value as string | undefined,
      fields.endHour?.value as string | undefined,
      fields.endMinute?.value as string | undefined,
      d,
    ] as const)

  const resourceType = typeVal === "kregle" ? "lane" : typeVal === "bilard" ? "billiard" : null

  const [allResources, setAllResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [times, setTimes] = useState<Map<string, ResourceTime>>(new Map())

  const initRef = useRef(false)
  const prevTypeRef = useRef(typeVal)

  // Reset when reservation type changes
  useEffect(() => {
    if (prevTypeRef.current !== typeVal) {
      prevTypeRef.current = typeVal
      initRef.current = false
      setSelectedIds(new Set())
      setTimes(new Map())
      setAllResources([])
    }
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

  // Initialize from form data once resources have loaded.
  // Reads segmentsVal/resourcesVal at effect run time (initial DB values, before any dispatch).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (initRef.current || allResources.length === 0) return
    initRef.current = true

    const defTime: ResourceTime = {
      startHour: startHourVal ?? "16",
      startMinute: startMinuteVal ?? "0",
      endHour: endHourVal ?? "18",
      endMinute: endMinuteVal ?? "0",
    }

    const segs = Array.isArray(segmentsVal) ? (segmentsVal as any[]) : []
    const initTimes = new Map<string, ResourceTime>()
    const initSelected = new Set<string>()

    if (segs.length > 0) {
      for (const seg of segs) {
        const resId = extractSegmentResource(seg)
        if (!resId) continue
        initSelected.add(resId)
        initTimes.set(resId, {
          startHour: String(seg.startHour ?? defTime.startHour),
          startMinute: String(seg.startMinute ?? defTime.startMinute),
          endHour: String(seg.endHour ?? defTime.endHour),
          endMinute: String(seg.endMinute ?? defTime.endMinute),
        })
      }
    } else {
      for (const resId of extractIds(resourcesVal)) {
        initSelected.add(resId)
        initTimes.set(resId, { ...defTime })
      }
    }

    setSelectedIds(initSelected)
    setTimes(initTimes)
  }, [allResources]) // intentionally omit form field values — capture only initial DB values

  const dispatchBoth = useCallback(
    (nextSelected: Set<string>, nextTimes: Map<string, ResourceTime>) => {
      const arr = [...nextSelected]
      ;(dispatch as any)({ type: "UPDATE", path: "resources", value: arr, valid: arr.length > 0 })
      const segments = arr.map((resId) => {
        const t = nextTimes.get(resId) ?? { startHour: "16", startMinute: "0", endHour: "18", endMinute: "0" }
        return {
          resource: resId,
          startHour: Number(t.startHour),
          startMinute: Number(t.startMinute),
          endHour: Number(t.endHour),
          endMinute: Number(t.endMinute),
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
          nextTimes.set(id, {
            startHour: String(startHourVal ?? "16"),
            startMinute: String(startMinuteVal ?? "0"),
            endHour: String(endHourVal ?? "18"),
            endMinute: String(endMinuteVal ?? "0"),
          })
          setTimes(nextTimes)
        }
      }
      setSelectedIds(next)
      dispatchBoth(next, nextTimes)
    },
    [selectedIds, times, startHourVal, startMinuteVal, endHourVal, endMinuteVal, dispatchBoth],
  )

  const handleTimeChange = useCallback(
    (resourceId: string, field: keyof ResourceTime, value: string) => {
      const nextTimes = new Map(times)
      const existing = nextTimes.get(resourceId) ?? { startHour: "16", startMinute: "0", endHour: "18", endMinute: "0" }
      nextTimes.set(resourceId, { ...existing, [field]: value })
      setTimes(nextTimes)
      dispatchBoth(selectedIds, nextTimes)
    },
    [times, selectedIds, dispatchBoth],
  )

  if (!resourceType) return null

  const typeLabel = typeVal === "kregle" ? "Tory kręgli" : "Stoły bilardowe"
  const singular = typeVal === "kregle" ? "Tor" : "Stół"
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
              <div className="brp__times-head">Godziny per zasób</div>
              {selectedResources.map((r) => {
                const id = String(r.id)
                const name = r.label || `${singular} ${r.number}`
                const t = times.get(id) ?? { startHour: "16", startMinute: "0", endHour: "18", endMinute: "0" }
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
                        {HOUR_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <span className="brp__time-sep">Do</span>
                      <select
                        aria-label={`${name} — godzina koniec`}
                        className="brp__sel"
                        value={t.endHour}
                        onChange={(e) => handleTimeChange(id, "endHour", e.target.value)}
                      >
                        {HOUR_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
                ? typeVal === "kregle" ? "tor" : "stół"
                : selectedIds.size < 5
                  ? typeVal === "kregle" ? "tory" : "stoły"
                  : typeVal === "kregle" ? "torów" : "stołów"}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default BowlingResourcePicker
