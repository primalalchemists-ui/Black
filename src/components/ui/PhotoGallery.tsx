"use client"

import * as React from "react"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import { useImageLoaded } from "@/lib/useImageLoaded"

type Photo = { src: string; alt: string }

/**
 * Ile pierwszych miniatur pobieramy z wyprzedzeniem.
 *
 * Siatka mobilna pokazuje 4 kafelki, karuzela na desktopie 5 (`basis-1/5`).
 * Szóstka pokrywa oba widoki z zapasem. Pozostałe 21 zdjęć zostaje na `lazy`,
 * żeby nie ściągać całej galerii przy wejściu na stronę.
 */
const PRIORITY_COUNT = 6

/**
 * Miniatury kart.
 *
 * Źródła galerii to zdjęcia 3000x4000 px, od 112 do 536 kB (razem 7,4 MB),
 * a karta pokazuje je w boksie ~233x175 px z `object-cover`. Ściągaliśmy więc
 * pełną rozdzielczość, żeby ją natychmiast przyciąć i pomniejszyć.
 *
 * Miniatury są przycięte do 4:3 WOKÓŁ ŚRODKA — dokładnie tak, jak kadruje
 * `object-cover` z domyślnym `object-position: 50% 50%` — więc kadr jest
 * identyczny jak dotąd, tylko bez nadmiarowych pikseli. Trzy szerokości
 * pozwalają przeglądarce wybrać wariant pod ekran i gęstość pikseli:
 * 320 px ~14 kB, 480 px ~23 kB, 640 px ~34 kB (średnio, zamiast ~281 kB).
 *
 * Lightbox dostaje NIEZMIENIONY oryginał — miniatury są tylko dla kart.
 */
const THUMB_WIDTHS = [320, 480, 640] as const

/** `/images/zdjecia/lokal/0.webp` → `lokal-0` */
function thumbBase(src: string): string | null {
  const m = src.match(/^\/images\/zdjecia\/(.+)\.webp$/)
  if (!m) return null
  return m[1].replace(/\//g, "-")
}

function thumbSrcSet(src: string): { src: string; srcSet: string } | null {
  const base = thumbBase(src)
  if (!base) return null
  return {
    src: `/images/zdjecia/thumbs/${base}-640.webp`,
    srcSet: THUMB_WIDTHS.map((w) => `/images/zdjecia/thumbs/${base}-${w}.webp ${w}w`).join(", "),
  }
}

/**
 * Szerokość karty w układzie: siatka mobilna ma 2 kolumny, karuzela na
 * desktopie pokazuje 5 kafelków (`basis-1/5`).
 */
const THUMB_SIZES = "(min-width: 768px) 20vw, 45vw"

function GalleryImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string
  alt: string
  className?: string
  /** Pobieranie od razu, bez czekania na zbliżenie do widoku. */
  priority?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const thumb = React.useMemo(() => thumbSrcSet(src), [src])
  // Stan wczytania dotyczy adresu, ktory faktycznie laduje przegladarka.
  const { loaded, animateIn, onLoaded } = useImageLoaded(thumb?.src ?? src)
  const imgRef = React.useRef<HTMLImageElement>(null)

  // Obraz z cache nie wywoła `onLoad`, więc sprawdzamy `complete` po montowaniu.
  React.useEffect(() => {
    if (!loaded && imgRef.current?.complete) onLoaded()
  }, [loaded, onLoaded])

  return (
    <div className="relative h-full w-full">
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
      <img
        ref={imgRef}
        src={thumb?.src ?? src}
        srcSet={thumb?.srcSet}
        sizes={thumb ? THUMB_SIZES : undefined}
        alt={alt}
        className={className}
        style={{
          opacity: loaded ? 1 : 0,
          transition: reduceMotion || !animateIn ? undefined : "opacity 0.35s ease-out",
        }}
        /*
         * Pierwsze miniatury pobieramy od razu, żeby były gotowe (i najczęściej
         * zdekodowane), zanim sekcja wjedzie w widok — wtedy nie ma ani
         * szkieletu, ani zaniku przy wejściu. Reszta z 27 zdjęć zostaje na
         * `lazy`: przy `eager` dla wszystkich dochodziły długo po pierwszym
         * renderze i obciążały start strony.
         *
         * `fetchPriority="low"` sprawia, że te pobrania nie konkurują
         * z obrazem hero, który jest elementem LCP.
         */
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "low" : undefined}
        decoding="async"
        onLoad={onLoaded}
        onError={onLoaded}
      />
    </div>
  )
}

function LightboxImage({ src, alt, closing }: { src: string; alt: string; closing: boolean }) {
  const reduceMotion = useReducedMotion()
  const [loaded, setLoaded] = React.useState(false)
  const imgRef = React.useRef<HTMLImageElement>(null)

  React.useEffect(() => {
    setLoaded(false)
    if (imgRef.current?.complete) setLoaded(true)
  }, [src])

  return (
    <div className="relative flex items-center justify-center">
      {!loaded && (
        <div className="absolute h-16 w-16 animate-spin rounded-full border-4 border-white/20 border-t-white/70" />
      )}
      <img
        ref={imgRef}
        key={src}
        src={src}
        alt={alt}
        className="max-h-[88vh] max-w-[80vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
        style={{
          /*
           * Przy zamykaniu obraz gasnie RAZEM z tlem. Pomiar pokazal, ze
           * wczesniej zostawal na opacity 1 przez cale 220 ms wygaszania
           * overlayu i urywal sie skokowo — zdjecie „wisialo" nad coraz
           * bardziej przejrzystym tlem, co widac jako mignięcie.
           */
          opacity: closing ? 0 : loaded ? 1 : 0,
          transform: loaded || reduceMotion ? "scale(1)" : "scale(0.97)",
          transition: reduceMotion ? undefined : "opacity 0.2s ease-out, transform 0.25s ease-out",
        }}
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
  const [dragX, setDragX] = React.useState(0)

  /*
   * Przesuwanie palcem istnieje tylko na urządzeniach dotykowych. Na desktopie
   * `dragX` jest zawsze 0, a mimo to `animate={{ x: 0 }}` ze sprężyną wciąż
   * tykało i po zakończeniu renderowało drzewo PONOWNIE — już w trakcie
   * wygaszania overlayu. Framer nakładał wtedy z powrotem `animate` na
   * element, który kończył `exit`: pomiar pokazał opacity 0 → 1 → zniknięcie
   * (+223 / +247 / +266 ms). To było właśnie to dodatkowe mignięcie.
   *
   * Sprężynę włączamy więc dopiero po pierwszym dotknięciu.
   */
  const [dragEnabled, setDragEnabled] = React.useState(false)

  /*
   * Zamykanie prowadzimy wlasnym stanem, nie tylko `exit`.
   *
   * Pomiar pokazal, ze po zakonczeniu `exit` framer przywracal elementowi
   * `animate`, czyli opacity 1, na jedna klatke przed usunieciem go z DOM
   * (+219 ms: 0.04 → 1 → zniknięcie). To bylo to dodatkowe mignięcie.
   * Zablokowanie sprezyny `dragX` nie wystarczylo.
   *
   * Gdy `closing` jest ustawione, `animate` celuje w to samo co `exit`, wiec
   * ponowne nalozenie `animate` nie ma czego rozjasnic.
   */
  const [closing, setClosing] = React.useState(false)

  /*
   * Widocznosc tla prowadzimy sami, przejsciem CSS, i NIE przez framera.
   *
   * Framer animowal `opacity` przez Web Animations API i po zakonczeniu
   * wejscia oddawal animacje, a wtedy przez jedna klatke obowiazywala wartosc
   * bazowa, czyli `initial: 0`. Zmierzone przy otwieraniu:
   *
   *     +245ms dialog 0.999  ->  +265ms dialog 0  ->  +289ms dialog 1
   *
   * Czarne tlo na moment znikalo i przebijala strona — to bylo mignięcie przy
   * otwieraniu. Przejscie CSS nie ma czego oddawac.
   */
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    // Pierwsza klatka z opacity 0, nastepna z 1 — inaczej przegladarka
    // nie ma od czego animowac.
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const requestClose = React.useCallback(() => {
    setClosing(true)
    window.setTimeout(onClose, reduceMotion ? 0 : 200)
  }, [onClose, reduceMotion])

  const touchRef = React.useRef<{ x: number; y: number; t: number } | null>(null)
  const lockAxis = React.useRef<"h" | "v" | null>(null)

  const prev = React.useCallback(() => {
    setDragX(0)
    setIdx((i) => (i - 1 + photos.length) % photos.length)
  }, [photos.length])

  const next = React.useCallback(() => {
    setDragX(0)
    setIdx((i) => (i + 1) % photos.length)
  }, [photos.length])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose()
      if (e.key === "ArrowLeft") prev()
      if (e.key === "ArrowRight") next()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [requestClose, prev, next])

  React.useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  /*
   * Wstępne pobranie SĄSIEDNICH zdjęć — poprzedniego i następnego.
   *
   * Lightbox pokazuje oryginały (3000x4000), więc strzałka w bok oznaczała
   * czekanie na nowy plik. Pobieramy tylko dwa najbliższe i tylko wtedy, gdy
   * lightbox jest otwarty — przy wejściu na stronę nie leci z tego nic.
   *
   * Ten `new Image()` korzysta z tej samej pamięci podręcznej co znacznik
   * `<img>`, więc przejście do sąsiada jest natychmiastowe, a nie podwójnie
   * pobrane.
   */
  React.useEffect(() => {
    if (photos.length < 2) return

    const neighbours = [
      photos[(idx + 1) % photos.length]?.src,
      photos[(idx - 1 + photos.length) % photos.length]?.src,
    ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)

    const imgs = neighbours.map((src) => {
      const img = new Image()
      img.src = src as string
      return img
    })

    return () => {
      // Przerwij pobieranie, jeśli użytkownik zamknął lightbox w trakcie.
      for (const img of imgs) img.src = ""
    }
  }, [idx, photos])

  function handleTouchStart(e: React.TouchEvent) {
    if (!dragEnabled) setDragEnabled(true)
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

    if (lockAxis.current === "h") {
      setDragX(dx)
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return
    const dx = e.changedTouches[0].clientX - touchRef.current.x
    const dt = Math.max(1, Date.now() - touchRef.current.t)
    const velocity = Math.abs(dx) / dt

    if (lockAxis.current === "h" && (Math.abs(dx) > 60 || velocity > 0.3)) {
      dx < 0 ? next() : prev()
    } else {
      setDragX(0)
    }

    touchRef.current = null
    lockAxis.current = null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black"
      style={{
        touchAction: "none",
        pointerEvents: closing ? "none" : "auto",
        opacity: visible && !closing ? 1 : 0,
        transition: reduceMotion ? undefined : "opacity 0.2s ease-out",
      }}
      onClick={requestClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Podgląd zdjęcia"
    >
      <button
        className="absolute right-4 top-4 z-10 rounded-full bg-white/15 p-3 text-white transition hover:bg-white/30"
        onClick={requestClose}
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

      {/* Wrapper z wizualnym przesunięciem podczas dragu */}
      <motion.div
        className="flex items-center justify-center"
        animate={dragEnabled ? { x: dragX } : undefined}
        transition={
          dragX === 0
            ? { type: "spring", stiffness: 400, damping: 40 }
            : { duration: 0 }
        }
      >
        <AnimatePresence mode="wait">
          <LightboxImage key={idx} src={photos[idx].src} alt={photos[idx].alt} closing={closing} />
        </AnimatePresence>
      </motion.div>

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
    </div>
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
                priority={i < PRIORITY_COUNT}
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
                      priority={i < PRIORITY_COUNT}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    />
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      </section>

      {/*
        Bez AnimatePresence: Lightbox sam opoznia odmontowanie o czas
        wygaszania (`requestClose`), wiec nie potrzebuje `exit`. Dzieki temu
        framer nie nakłada juz `animate` na element, ktory konczy wychodzic.
      */}
      {lightboxIdx !== null && (
        <Lightbox photos={photos} startIndex={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
    </>
  )
}
