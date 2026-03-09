import Image from "next/image"

type SiteSettings = {
  name?: string
  slogan?: string
  facebook?: string
  instagram?: string
}

export default function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear()

  return (
    <footer className="w-full bg-background border-t">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-6 px-4 py-6 md:px-0 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            © {year}{" "}
            <span className="font-black">
              {settings?.name ?? "Centrum Spotkań Black"}
            </span>
          </div>

          <a
            href="#header"
            aria-label="Wróć na górę strony"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background transition hover:bg-muted"
          >
            <Image
              src="/images/icons/arrow-up.svg"
              alt=""
              width={20}
              height={20}
              className="h-5 w-5"
            />
          </a>
        </div>

        <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:gap-6">
          <a
            href="/dofinansowanie"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Dofinansowanie
          </a>

          <a
            href="/api/privacy-policy"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Polityka prywatności
          </a>

          <a
            href="/api/regulamin"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Regulamin
          </a>
        </div>

        <div className="flex items-center gap-3">
          {settings?.facebook ? (
            <a
              href={settings.facebook}
              target="_blank"
              rel="noreferrer"
              aria-label="Facebook"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background transition hover:bg-muted"
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border bg-background transition hover:bg-muted"
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
        </div>
      </div>
    </footer>
  )
}