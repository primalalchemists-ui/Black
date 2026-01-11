"use client"

import * as React from "react"
import type { CarouselApi } from "@/components/ui/carousel"

type DotNavProps = {
  api: CarouselApi | undefined
  label: string
  className?: string
}

export default function DotNav({ api, label, className }: DotNavProps) {
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
          aria-selected={selectedIndex === i}
          aria-current={selectedIndex === i ? "true" : undefined}
          className={[
            "h-2.5 w-2.5 rounded-full border transition",
            selectedIndex === i
              ? "bg-foreground border-foreground"
              : "bg-transparent border-muted-foreground/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          ].join(" ")}
          onClick={() => api.scrollTo(i)}
        />
      ))}
    </div>
  )
}
