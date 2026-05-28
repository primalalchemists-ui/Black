import PhotoGallery from "@/components/ui/PhotoGallery"
import { GALLERY_PHOTOS_IMPREZY } from "@/lib/galleryPhotos"
import config from "@payload-config"
import { getPayload } from "payload"
import { Phone, Users, Target, Wine } from "lucide-react"

const FEATURES = [
  {
    icon: Users,
    title: "Sala eventowa",
    desc: "Przestronna sala z kącikiem dla dzieci, gotowa na każdą imprezę.",
  },
  {
    icon: Target,
    title: "2 tory do kręgli",
    desc: "Dodatkowa rozrywka dla gości w każdym wieku.",
  },
  {
    icon: Wine,
    title: "Bar",
    desc: "Pełen asortyment napojów, koktajli i drinków.",
  },
]

const OCCASIONS = ["Urodziny", "Stypy", "Komunie", "Chrzciny", "Rocznice", "Wieczory kawalerskie"]

export default async function ImprezyPage() {
  const payload = await getPayload({ config })

  const settings = await payload.findGlobal({
    slug: "site-settings",
  })

  const phone = settings?.phone as string | undefined

  return (
    <div className="grid w-full gap-10 px-4 md:px-0 py-4">
      {/* Header */}
      <div className="grid gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Imprezy okolicznościowe</h1>
        <p className="text-muted-foreground">Zorganizuj niezapomniane chwile w wyjątkowym miejscu.</p>
      </div>

      {/* Occasions */}
      <div className="flex flex-wrap gap-2">
        {OCCASIONS.map((occ) => (
          <span
            key={occ}
            className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground"
          >
            {occ}
          </span>
        ))}
      </div>

      {/* Features */}
      <div className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-2xl border bg-card p-5">
            <Icon aria-hidden="true" className="mb-3 h-7 w-7 text-[hsl(var(--brand))]" />
            <div className="font-semibold">{title}</div>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[hsl(var(--brand)/0.35)] bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold">Chcesz zorganizować imprezę?</div>
          <p className="mt-1 text-sm text-muted-foreground">Zadzwoń — omówimy szczegóły i termin.</p>
        </div>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Phone aria-hidden="true" className="h-4 w-4" />
            {phone}
          </a>
        ) : null}
      </div>

      <PhotoGallery photos={GALLERY_PHOTOS_IMPREZY} title="Galeria" titleId="imprezy-gallery-title" />
    </div>
  )
}
