"use client"

import * as React from "react"

/**
 * Flaga, która włącza się dopiero, gdy warunek utrzyma się przez `delayMs`.
 *
 * Służy do wskaźników ładowania. Pomiar na stagingu pokazał, że nakładka
 * „Ładowanie dostępności…" zdążała PŁYNNIE WEJŚĆ do opacity 0.93, a potem
 * natychmiast gasła, bo dane przychodziły w ~200 ms. Dla użytkownika to
 * pojawienie się i zniknięcie placeholdera — dokładnie efekt
 * „pojawia się, znika, pojawia znowu".
 *
 * Przy szybkiej odpowiedzi flaga nigdy nie zdąży się włączyć, więc nie ma
 * czego migać. Przy wolnej — wskaźnik pojawia się normalnie.
 *
 * Wyłączenie jest natychmiastowe: gdy dane są gotowe, wskaźnik nie ma po co
 * dalej czekać.
 */
export function useDelayedFlag(active: boolean, delayMs = 250): boolean {
  const [shown, setShown] = React.useState(false)

  React.useEffect(() => {
    if (!active) {
      setShown(false)
      return
    }

    const id = window.setTimeout(() => setShown(true), delayMs)
    return () => window.clearTimeout(id)
  }, [active, delayMs])

  return active && shown
}
