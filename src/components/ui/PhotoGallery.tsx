"use client"

import * as React from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"

type Photo = { src: string; alt: string }

/** Zdjęcie z skeleton + fade-in, spójne z FadeInImage */
function GalleryImage({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const [loaded, setLoaded] = React.useState(false)
  const imgRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    setLoaded(false)
    // Obrazki SSR-owane ładują się przed hydracją React → onLoad nigdy nie strzela.
    // Sprawdzamy complete po mountzie żeby obsłużyć ten przypadek.
    if (imgRef.current?.complete) {
      setLoaded(true)
    }
  }, [src])

  return (
    <div className="relative h-full w-full">
      {/* skeleton */}
      <AnimatePresence>
        {!loaded && (
          <motion.div
            key="skeleton"
            className="absolute inset-0 animate-pulse rounded-xl bg-muted"
            initial={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.25 } }}
          />
        )}
      </AnimatePresence>

      {/* zdjęcie */}
      <motion.img
        ref={imgRef}
        src={src}
        alt={alt}
        className={className}
        loading="eager"
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  )
}

/** Zdjęcie w lightboxie — fade przy zmianie */
function LightboxImage({ src, alt }: { src: string; alt: string }) {
  const reduceMotion = useReducedMotion()
  const [loaded, setLoaded] = React.useState(false)
  const imgRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    setLoaded(false)
    if (imgRef.current?.complete) {
      setLoaded(true)
    }
  }, [src])

  return (
    <div className="relative flex items-center justify-center">
      {!loaded && (
        <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white/70" />
      )}
      <motion.img
        ref={imgRef}
        key={src}
        src={src}
        alt={alt}
        className="max-h-[88vh] max-w-[80vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }}
        animate={{ opacity: loaded ? 1 : 0, scale: 1 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  )
}

function Lightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: readonly Photo[]
  startIndex: number
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [idx, setIdx] = React.useState(startIndex)

  const prev = React.useCallback(
    () => setIdx((i) => (i - 1 + photos.length) % photos.length),
    [photos.length],
  )
  const next = React.useCallback(
    () => setIdx((i) => (i + 1) % photos.length),
    [photos.length],
  )

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") prev()
      if (e.key === "ArrowRight") next()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose, prev, next])

  React.useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Podgląd zdjęcia"
    >
      <button
        className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-2 text-white transition hover:bg-white/30"
        onClick={onClose}
        aria-label="Zamknij"
      >
        <X className="h-5 w-5" />
      </button>

      <button
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white shadow-lg transition hover:bg-white/40 active:scale-95"
        onClick={(e) => { e.stopPropagation(); prev() }}
        aria-label="Poprzednie zdjęcie"
      >
        <ChevronLeft className="h-7 w-7" />
      </button>

      <AnimatePresence mode="wait">
        <LightboxImage key={idx} src={photos[idx].src} alt={photos[idx].alt} />
      </AnimatePresence>

      <button
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white shadow-lg transition hover:bg-white/40 active:scale-95"
        onClick={(e) => { e.stopPropagation(); next() }}
        aria-label="Następne zdjęcie"
      >
        <ChevronRight className="h-7 w-7" />
      </button>

      <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
        {idx + 1} / {photos.length}
      </span>
    </motion.div>
  )
}

export default function PhotoGallery({
  photos,
  title = "Galeria",
  titleId = "gallery-title",
}: {
  photos: readonly Photo[]
  title?: string
  titleId?: string
}) {
  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null)

  return (
    <>
      <section aria-labelledby={titleId} className="grid w-full gap-4">
        <div className="flex items-center justify-between px-4 md:px-0">
          <h2 id={titleId} className="text-2xl font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setLightboxIdx(0)}>
            Zobacz wszystkie
          </Button>
        </div>

        {/* mobile: siatka 2-kolumnowa, tylko 4 pierwsze */}
        <div className="grid grid-cols-2 gap-2 px-4 md:hidden">
          {photos.slice(0, 4).map((photo, i) => (
            <button
              type="button"
              key={i}
              className="aspect-[4/3] overflow-hidden rounded-xl bg-muted"
              onClick={() => setLightboxIdx(i)}
              aria-label={`Otwórz: ${photo.alt}`}
            >
              <GalleryImage
                src={photo.src}
                alt={photo.alt}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </button>
          ))}
        </div>

        {/* desktop: carousel */}
        <div className="hidden md:block">
          <Carousel opts={{ align: "start", dragFree: true }}>
            <CarouselContent className="-ml-2">
              {photos.map((photo, i) => (
                <CarouselItem key={i} className="pl-2 basis-1/5">
                  <button
                    type="button"
                    className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted"
                    onClick={() => setLightboxIdx(i)}
                    aria-label={`Otwórz: ${photo.alt}`}
                  >
                    <GalleryImage
                      src={photo.src}
                      alt={photo.alt}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </section>

      <AnimatePresence>
        {lightboxIdx !== null && (
          <Lightbox
            photos={photos}
            startIndex={lightboxIdx}
            onClose={() => setLightboxIdx(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
