"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

import { useImageLoaded } from "@/lib/useImageLoaded";

type FadeInImageProps = HTMLMotionProps<"img"> & {
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

  return (
    <motion.img
      ref={imgRef}
      {...props}
      className={className}
      initial={animateIn ? { opacity: 0 } : false}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration, ease: "easeOut" }}
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
