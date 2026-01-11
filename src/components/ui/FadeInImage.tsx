"use client";

import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

type FadeInImageProps = HTMLMotionProps<"img"> & {
  duration?: number;
};

export function FadeInImage({ duration = 0.35, onLoad, className, ...props }: FadeInImageProps) {
  const reduceMotion = useReducedMotion();
  const [loaded, setLoaded] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    setLoaded(false);
  }, [props.src]);

  React.useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    // jeśli obraz już jest w cache i complete=true, to onLoad mogło nie odpalić
    if (img.complete && img.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [props.src]);

  return (
    <motion.img
      ref={imgRef}
      {...props}
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration, ease: "easeOut" }}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      onError={() => {
        // jak failnie, to też pokaż (albo zostaw 0 jeśli wolisz)
        setLoaded(true);
      }}
    />
  );
}
