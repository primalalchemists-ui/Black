"use client";

import * as React from "react";
import { useReducedMotion } from "framer-motion";

import { useImageLoaded } from "@/lib/useImageLoaded";

type FadeInImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  duration?: number;
};

export function FadeInImage({ duration = 0.35, onLoad, className, ...props }: FadeInImageProps) {
  const reduceMotion = useReducedMotion();
  const src = typeof props.src === "string" ? props.src : undefined;
  const { loaded, animateIn, onLoaded } = useImageLoaded(src);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  // Obraz z cache nie wywoła `onLoad` — sprawdzamy `complete` po montowaniu.
  // Poprzednia wersja dodatkowo zerowała stan przy każdym montowaniu, więc
  // przemontowanie odtwarzało fade od zera. Teraz decyduje `useImageLoaded`.
  React.useEffect(() => {
    if (loaded) return;
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) onLoaded();
  }, [loaded, onLoaded]);

  /*
 * Zanik prowadzony przejsciem CSS, nie framer-motion.
 *
 * Framer animuje `opacity` przez Web Animations API. Po zakonczeniu animacji
 * usuwa ja z elementu i przez JEDNA KLATKE obowiazuje wartosc bazowa, czyli
 * `initial` — a ta jest zerowa. Pomiar na stagingu pokazal to dokladnie:
 *
 *     +1373ms opacity 0.997  ->  +1391ms opacity 0  ->  +1406ms opacity 1
 *
 * Dla uzytkownika to mignięcie dokladnie w chwili, gdy obraz konczy sie
 * pojawiac. Zachowanie zalezy od momentu zatwierdzenia animacji w Chromium,
 * dlatego widac je na Chrome, a nie na Safari w iOS.
 *
 * Przejscie CSS nie ma tego przekazania: wartosc docelowa jest jednoczesnie
 * wartoscia stylu, wiec nie ma do czego wracac. Czas i krzywa pozostaja te same.
 */
  return (
    <img
      ref={imgRef}
      {...props}
      className={className}
      style={{
        ...props.style,
        opacity: loaded ? 1 : 0,
        transition: reduceMotion || !animateIn ? undefined : `opacity ${duration}s ease-out`,
      }}
      onLoad={(e) => {
        onLoaded();
        onLoad?.(e);
      }}
      onError={() => {
        // jak failnie, to też pokaż (albo zostaw 0 jeśli wolisz)
        onLoaded();
      }}
    />
  );
}
