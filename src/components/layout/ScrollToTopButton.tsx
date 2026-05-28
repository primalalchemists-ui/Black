"use client"

import Image from "next/image"

export function ScrollToTopButton() {
  return (
    <button
      type="button"
      aria-label="Wróć na górę strony"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-transparent transition hover:bg-black/5"
    >
      <Image
        src="/images/icons/arrow-up.svg"
        alt=""
        width={20}
        height={20}
        className="h-5 w-5"
      />
    </button>
  )
}
