"use client"

import * as React from "react"

/**
 * Jednorazowe odsłonięcie, gdy element wejdzie w widok.
 *
 * Obserwator rozłącza się po pierwszym trafieniu, więc animacja nie startuje
 * ponownie przy przewijaniu ani przy żadnej zmianie stanu w komponencie.
 * To celowo NIE jest animacja oparta na montowaniu — przemontowanie nie ma
 * jej czym wywołać drugi raz, bo stan żyje w komponencie, a nie w kluczu.
 *
 * Gdy IntersectionObserver jest niedostępny albo użytkownik prosi o
 * ograniczenie ruchu, zwraca `true` od razu: treść jest widoczna bez animacji.
 */
export function useRevealOnce<T extends Element>(options?: {
  rootMargin?: string
  threshold?: number
}): { ref: React.RefObject<T | null>; revealed: boolean } {
  const ref = React.useRef<T | null>(null)
  const [revealed, setRevealed] = React.useState(false)

  React.useEffect(() => {
    if (revealed) return

    const node = ref.current
    if (!node) return

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches

    if (reduce || typeof IntersectionObserver === "undefined") {
      setRevealed(true)
      return
    }

    // Element moze byc juz w widoku w chwili montowania.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true)
            observer.disconnect()
            return
          }
        }
      },
      {
        rootMargin: options?.rootMargin ?? "0px 0px -10% 0px",
        threshold: options?.threshold ?? 0.1,
      },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [revealed, options?.rootMargin, options?.threshold])

  return { ref, revealed }
}
