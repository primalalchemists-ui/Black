import type { SiteSettings } from "@/lib/siteSettings"
import { Card, CardContent } from "@/components/ui/card"

export default function ContactSection({ settings }: { settings: SiteSettings }) {
  return (
    <section aria-labelledby="contact-title" className="mx-auto grid w-full gap-4 px-4 md:px-0">
      <h2 id="contact-title" className="text-2xl font-semibold">
        Kontakt
      </h2>

      <Card className="bg-muted/30 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)]">
        <CardContent className="relative py-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-6 right-4 top-6 hidden w-[140px] opacity-80 md:block"
          >
            <img
              src="/images/icons/contact.png"
              alt=""
              className="h-full w-full object-contain object-right"
              loading="lazy"
            />
          </div>

          <div className="grid gap-2 md:pr-[170px]">
            <p>
              <span className="font-medium">Telefon:</span>{" "}
              {settings.phone ? settings.phone : "+48 XXX XXX XXX"}
            </p>
            <p>
              <span className="font-medium">Email:</span>{" "}
              {settings.email ? settings.email : "kontakt@centrumblack.pl"}
            </p>
            <p>
              <span className="font-medium">Adres:</span>{" "}
              {settings.address ? settings.address : "(uzupełnimy z CMS)"}
            </p>

            <div aria-hidden="true" className="pt-2 md:hidden">
              <img
                src="/images/icons/contact.png"
                alt=""
                className="h-16 w-16 object-contain"
                loading="lazy"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
