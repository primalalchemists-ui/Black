"use client"

import * as React from "react"
import { X, ChevronLeft, ChevronRight, Play } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"

type Video = { src: string; label?: string }

function VideoThumbnail({
  src,
  label,
  onClick,
}: {
  src: string
  label?: string
  onClick: () => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)

  function handleLoadedMetadata() {
    const v = videoRef.current
    if (v) v.currentTime = 0.001
  }

  return (
    <button
      type="button"
      className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted"
      onClick={onClick}
      aria-label={label ? `Odtwórz: ${label}` : "Odtwórz film"}
    >
      <video
        ref={videoRef}
        src={src}
        preload="metadata"
        muted
        playsInline
        className="h-full w-full object-cover"
        onLoadedMetadata={handleLoadedMetadata}
        tabIndex={-1}
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors group-hover:bg-black/45">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
          <Play className="h-5 w-5 translate-x-0.5 text-black" fill="currentColor" />
        </div>
      </div>
    </button>
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
    // nie przechwytuj jeśli dotknięto video (żeby kontrolki działały)
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
                    src={video.src}
                    label={video.label}
                    onClick={() => setLightboxIdx(i)}
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
              src={video.src}
              label={video.label}
              onClick={() => setLightboxIdx(i)}
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
