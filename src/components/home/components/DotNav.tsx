"use client"

import * as React from "react"
import type { CarouselApi } from "@/components/ui/carousel"

type DotNavProps = {
  api: CarouselApi | undefined
  label: string
  className?: string
  variant?: "dots" | "numbers"
}

export default function DotNav({ api, label, className, variant = "dots" }: DotNavProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [snapCount, setSnapCount] = React.useState(0)

  React.useEffect(() => {
    if (!api) return

    const onSelect = () => setSelectedIndex(api.selectedScrollSnap())
    const init = () => {
      setSnapCount(api.scrollSnapList().length)
      onSelect()
    }

    init()
    api.on("select", onSelect)
    api.on("reInit", init)

    return () => {
      api.off("select", onSelect)
      api.off("reInit", init)
    }
  }, [api])

  if (!api || snapCount <= 1) return null

  if (variant === "numbers") {
    return (
      <div
        role="tablist"
        aria-label={label}
        className={["flex items-center gap-1", className ?? ""].join(" ")}
      >
        {Array.from({ length: snapCount }).map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-label={`Przejdź do slajdu ${i + 1}`}
            aria-selected={selectedIndex === i ? "true" : "false"}
            aria-current={selectedIndex === i ? "true" : undefined}
            onClick={() => api.scrollTo(i)}
            className={[
              "flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selectedIndex === i
                ? "bg-transparent text-foreground border-foreground"
                : "bg-transparent text-muted-foreground border-border hover:border-foreground/60 hover:text-foreground",
            ].join(" ")}
          >
            {i + 1}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={["flex items-center justify-center gap-2", className ?? ""].join(" ")}
    >
      {Array.from({ length: snapCount }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-label={`Przejdź do slajdu ${i + 1}`}
          aria-selected={selectedIndex === i ? "true" : "false"}
          aria-current={selectedIndex === i ? "true" : undefined}
          className="flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => api.scrollTo(i)}
        >
          <span
            aria-hidden="true"
            className={[
              "h-2.5 w-2.5 rounded-full border transition",
              selectedIndex === i
                ? "bg-foreground border-foreground"
                : "bg-transparent border-muted-foreground/40",
            ].join(" ")}
          />
        </button>

      ))}
    </div>
  )
}
