"use client"

import Link from "next/link"
import { useRef, useEffect } from "react"

type OfferItem = {
  title: string
  desc: string
  href: string
  video: string
}

const OFFER: OfferItem[] = [
  {
    title: "Restauracja",
    desc: "Poznaj ofertę naszych dań.",
    href: "/restauracja",
    video: "/images/oferta/restauracja.webm",
  },
  {
    title: "Rozrywka",
    desc: "Kręgle, bilard i kącik kibica.",
    href: "/rozrywka",
    video: "/images/oferta/rozrywka.webm",
  },
  {
    title: "Imprezy",
    desc: "Urodziny, komunie, stypy, chrzciny.",
    href: "/imprezy",
    video: "/images/oferta/impreza.webm",
  },
  {
    title: "Biznes",
    desc: "Konferencje i szkolenia.",
    href: "/biznes",
    video: "/images/oferta/biznes.webm",
  },
]

function OfferCard({ item }: { item: OfferItem }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const isTouch = window.matchMedia("(hover: none)").matches
    if (!isTouch) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.4 },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  function handleMouseEnter() {
    if (window.matchMedia("(hover: none)").matches) return
    videoRef.current?.play().catch(() => {})
  }

  function handleMouseLeave() {
    if (window.matchMedia("(hover: none)").matches) return
    videoRef.current?.pause()
  }

  return (
    <Link
      href={item.href}
      className="group relative block h-full w-full overflow-hidden rounded-2xl bg-black shadow-md transition-all duration-300 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <video
        ref={videoRef}
        src={item.video}
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/65 via-black/15 to-black/65" />

      <div className="absolute bottom-0 left-0 right-0 p-4 text-center md:p-5">
        <h3 className="text-lg font-semibold text-white md:text-xl">{item.title}</h3>
      </div>
    </Link>
  )
}

export default function OfferSection() {
  return (
    <section aria-labelledby="offer-title" className="mx-auto grid w-full gap-4 px-4 md:px-0">
      <h2 id="offer-title" className="text-2xl font-semibold">
        Oferta
      </h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {OFFER.map((item) => (
          <div key={item.title} className="aspect-video md:aspect-[4/3]">
            <OfferCard item={item} />
          </div>
        ))}
      </div>
    </section>
  )
}
