import Image from "next/image"
import { ScrollToTopButton } from "./ScrollToTopButton"

type SiteSettings = {
  name?: string
  slogan?: string
  facebook?: string
  instagram?: string
}

export default function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear()

  return (
    <footer className="w-full">
      <div className="max-w-[1200px] mx-auto px-4 md:px-0">
        <div className="border-t pt-5 pb-3">
          <a
            href="/dofinansowanie"
            aria-label="Informacja o dofinansowaniu"
            className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <div className="relative w-full h-[64px]">
              <Image
                src="/images/logo/logotyp-unia.png"
                alt="Logotyp Funduszy Europejskich i NextGenerationEU"
                fill
                className="object-contain object-center"
              />
            </div>
          </a>
        </div>

        <div className="flex flex-col gap-6 py-6 lg:flex-row lg:items-center lg:justify-between">
          {/* copyright */}
          <div className="text-sm text-muted-foreground">
            © {year}{" "}
            <span className="font-black">
              {settings?.name ?? "Centrum Spotkań Black"}
            </span>
          </div>

          {/* linki */}
          <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:gap-6">
            <a
              href="/dofinansowanie"
              className="text-sm text-muted-foreground underline hover:text-[hsl(var(--brand-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              Dofinansowanie
            </a>

            <a
              href="/api/privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline hover:text-[hsl(var(--brand-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              Polityka prywatności
            </a>

            <a
              href="/api/regulamin"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground underline hover:text-[hsl(var(--brand-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              Regulamin
            </a>
          </div>

          {/* social + strzałka */}
          <div className="flex items-center gap-3">
            {settings?.facebook ? (
              <a
                href={settings.facebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-transparent transition hover:bg-black/5"
              >
                <Image
                  src="/images/icons/facebook.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5"
                />
              </a>
            ) : null}

            {settings?.instagram ? (
              <a
                href={settings.instagram}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-transparent transition hover:bg-black/5"
              >
                <Image
                  src="/images/icons/instagram.svg"
                  alt=""
                  width={20}
                  height={20}
                  className="h-5 w-5"
                />
              </a>
            ) : null}

            <ScrollToTopButton />
          </div>
        </div>
      </div>
    </footer>
  )
}
