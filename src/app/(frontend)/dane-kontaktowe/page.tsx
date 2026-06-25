import { Hash, Mail, MapPin, Phone } from "lucide-react"

export const metadata = {
  title: "Dane kontaktowe | Centrum Spotkań Black",
  description: "Dane kontaktowe Centrum Rozrywkowego Black w Wieluniu — adres, telefon, e-mail, NIP.",
}

export default function DaneKontaktowePage() {
  return (
    <div className="px-4 pb-12 mt-10">
      <div className="mx-auto max-w-full">

        {/* Nagłówek */}
        <div className="mb-8">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--brand))]">
            Centrum Rozrywkowe Black
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Dane kontaktowe</h1>
        </div>

        {/* Karta z danymi */}
        <div className="rounded-2xl border bg-card px-6 py-8 md:px-10">

          <div className="mb-6 border-b border-border/60 pb-6">
            <p className="text-lg font-semibold text-foreground">P.P.H.U. „ANDREA" Andrzej Kamiński</p>
            <p className="text-muted-foreground">Centrum Rozrywkowe „BLACK"</p>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Adres siedziby</p>
                <p className="text-sm text-foreground">Sieradzka 28A</p>
                <p className="text-sm text-foreground">98-300 Wieluń</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Hash className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">NIP</p>
                <p className="text-sm text-foreground">8321002917</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Telefon</p>
                <a
                  href="tel:+48691246975"
                  className="text-sm text-foreground transition-colors hover:text-[hsl(var(--brand))]"
                >
                  691 246 975
                </a>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">E-mail</p>
                <a
                  href="mailto:blackplatnosci@gmail.com"
                  className="text-sm text-foreground transition-colors hover:text-[hsl(var(--brand))]"
                >
                  blackplatnosci@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
