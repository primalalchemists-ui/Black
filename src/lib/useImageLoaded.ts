"use client"

import * as React from "react"

/**
 * Pamięć wczytanych obrazów, trzymana POZA Reactem.
 *
 * Powód: komponenty obrazkowe animowały `opacity` od 0 do 1 na podstawie stanu
 * `loaded`, który startował od `false` przy każdym montowaniu. Gdy coś
 * przemontowało drzewo po wczytaniu obrazu — a na stronie głównej robi to
 * ponowna inicjalizacja karuzeli po doczytaniu zdjęć galerii — opacity wracało
 * do zera i fade leciał po raz drugi. Pomiar na stagingu pokazał dokładnie to:
 * opacity 0.996 → 0 → 1 w dwóch klatkach.
 *
 * Zbiór poniżej żyje tyle, co karta przeglądarki, więc kolejne montowanie tego
 * samego adresu startuje od `loaded = true` i animacja się nie powtarza.
 * Pierwsze wczytanie zachowuje się jak dotąd: fade jest widoczny.
 */
const loadedSources = new Set<string>()

export function markImageLoaded(src: string | undefined): void {
  if (src) loadedSources.add(src)
}

export function wasImageLoaded(src: string | undefined): boolean {
  return Boolean(src && loadedSources.has(src))
}

export type ImageLoadedState = {
  /** Czy obraz jest gotowy do pokazania. */
  loaded: boolean
  /** Czy to pierwsze wczytanie tego adresu — tylko wtedy animujemy od zera. */
  animateIn: boolean
  onLoaded: () => void
}

/**
 * Stan wczytania obrazu odporny na przemontowanie.
 *
 * `animateIn` jest ustalany raz, przy montowaniu, i nie zmienia się w trakcie
 * życia komponentu — dzięki temu `initial` przekazywane do framer-motion jest
 * stabilne, a to ono decyduje, czy fade ma się odtworzyć.
 */
export function useImageLoaded(src: string | undefined): ImageLoadedState {
  const seenAtMount = React.useRef(wasImageLoaded(src)).current
  const [loaded, setLoaded] = React.useState(seenAtMount)

  // Zmiana adresu to nowy obraz: wracamy do stanu niewczytanego, chyba że ten
  // konkretny adres był już kiedyś wczytany.
  const prevSrc = React.useRef(src)
  if (prevSrc.current !== src) {
    prevSrc.current = src
    const known = wasImageLoaded(src)
    if (loaded !== known) setLoaded(known)
  }

  const onLoaded = React.useCallback(() => {
    markImageLoaded(src)
    setLoaded(true)
  }, [src])

  return { loaded, animateIn: !seenAtMount, onLoaded }
}
