"use client"

import * as React from "react"
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"

type Video = { src: string; poster: string; label?: string }

/**
 * Miniatura = statyczny obraz, NIE element <video>.
 *
 * Wcześniej każda miniatura renderowała pełny `<video src>` z
 * `preload="metadata"` i wymuszała `currentTime = 0.001`, żeby wyciągnąć
 * klatkę otwierającą. Seek zmusza przeglądarkę do pobrania realnych bajtów
 * media, a nie samych metadanych — pomiar produkcji pokazał 8 371 KB w 7
 * żądaniach wideo na stronie restauracji, w tym DWA pełne filmy (4 323 KB
 * i 3 973 KB) pobrane wyłącznie po to, by pokazać dwa nieruchome kadry.
 *
 * Statyczne WebP (łącznie ~215 KB na pięć miniatur) dają ten sam obraz:
 * kadr jest wycięty tak samo, jak robił to `object-cover` na pionowym
 * źródle, więc wygląd galerii się nie zmienia. Pełne wideo ładuje się
 * dopiero po otwarciu lightboxa.
 */
function VideoThumbnail({
  poster,
  label,
  onClick,
  index = 0,
}: {
  poster: string
  label?: string
  onClick: () => void
  index?: number
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: reduceMotion ? 0 : index * 0.09,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted"
      onClick={onClick}
      aria-label={label ? `Odtwórz: ${label}` : "Odtwórz film"}
    >
      {/*
        alt="" — obraz jest dekoracyjny wewnątrz przycisku, który ma już
        aria-label. Inaczej czytnik ekranu przeczytałby opis dwa razy.
        Jawne width/height utrzymują proporcje zanim plik dotrze (brak CLS).
        loading="lazy" sprawia, że ukryty wariant układu (display:none)
        nie pobiera nic — nie ma więc podwójnego ładowania mobile/desktop.
      */}
      <img
        src={poster}
        alt=""
        width={640}
        height={480}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/30 transition-colors group-hover:bg-black/45" />

      {/* Play button */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
          <Play className="h-5 w-5 translate-x-0.5 text-black" fill="currentColor" />
        </div>
      </div>
    </motion.button>
  )
}

function VideoLightbox({
  videos,
  startIndex,
  onClose,
}: {
  videos: Video[]
  startIndex: number
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()
  const [idx, setIdx] = React.useState(startIndex)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  const touchRef = React.useRef<{ x: number; y: number; t: number } | null>(null)
  const lockAxis = React.useRef<"h" | "v" | null>(null)

  const prev = React.useCallback(
    () => setIdx((i) => (i - 1 + videos.length) % videos.length),
    [videos.length],
  )
  const next = React.useCallback(
    () => setIdx((i) => (i + 1) % videos.length),
    [videos.length],
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

  React.useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.load()
    v.play().catch(() => {})
  }, [idx])

  function handleTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).tagName === "VIDEO") return
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() }
    lockAxis.current = null
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchRef.current) return
    const dx = e.touches[0].clientX - touchRef.current.x
    const dy = e.touches[0].clientY - touchRef.current.y
    if (lockAxis.current === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      lockAxis.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v"
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return
    const dx = e.changedTouches[0].clientX - touchRef.current.x
    const dt = Math.max(1, Date.now() - touchRef.current.t)
    const velocity = Math.abs(dx) / dt
    if (lockAxis.current === "h" && (Math.abs(dx) > 60 || velocity > 0.3)) {
      dx < 0 ? next() : prev()
    }
    touchRef.current = null
    lockAxis.current = null
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{ touchAction: "none" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Odtwarzacz wideo"
    >
      <button
        type="button"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/30"
        onClick={onClose}
        aria-label="Zamknij"
      >
        <X className="h-5 w-5" />
      </button>

      {videos.length > 1 && (
        <button
          type="button"
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white shadow-lg transition hover:bg-white/40 active:scale-95"
          onClick={(e) => { e.stopPropagation(); prev() }}
          aria-label="Poprzedni film"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      <video
        ref={videoRef}
        key={idx}
        src={videos[idx].src}
        // Miniatura jako poster — kadr widać natychmiast po otwarciu,
        // zamiast czarnego prostokąta w oczekiwaniu na pierwszą klatkę.
        poster={videos[idx].poster}
        controls
        autoPlay
        playsInline
        className="touch-auto max-h-[88vh] max-w-[85vw] rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />

      {videos.length > 1 && (
        <button
          type="button"
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/20 p-3 text-white shadow-lg transition hover:bg-white/40 active:scale-95"
          onClick={(e) => { e.stopPropagation(); next() }}
          aria-label="Następny film"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-sm text-white/80">
        {idx + 1} / {videos.length}
      </span>
    </motion.div>
  )
}

export default function VideoGallery({
  videos,
  title = "Filmy",
  titleId = "video-gallery-title",
}: {
  videos: Video[]
  title?: string
  titleId?: string
}) {
  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null)

  return (
    <>
      <section aria-labelledby={titleId} className="grid w-full gap-4">
        {title && (
          <div className="px-4 md:px-0">
            <h2 id={titleId} className="text-2xl font-semibold">
              {title}
            </h2>
          </div>
        )}

        {/* mobile: carousel, 2 per view */}
        <div className="md:hidden">
          <Carousel opts={{ align: "start", dragFree: true }}>
            <CarouselContent className="-ml-2 pr-4">
              {videos.map((video, i) => (
                <CarouselItem key={i} className="pl-2 basis-1/2">
                  <VideoThumbnail
                    poster={video.poster}
                    label={video.label}
                    onClick={() => setLightboxIdx(i)}
                    index={i}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>

        {/* desktop: grid of 5 */}
        <div className="hidden md:grid md:grid-cols-5 gap-2">
          {videos.map((video, i) => (
            <VideoThumbnail
              key={i}
              poster={video.poster}
              label={video.label}
              onClick={() => setLightboxIdx(i)}
              index={i}
            />
          ))}
        </div>
      </section>

      <AnimatePresence>
        {lightboxIdx !== null && (
          <VideoLightbox
            videos={videos}
            startIndex={lightboxIdx}
            onClose={() => setLightboxIdx(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
