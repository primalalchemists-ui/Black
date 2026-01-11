import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import config from "@payload-config"
import { getPayload } from "payload"

export default async function ImprezyPage() {
  const payload = await getPayload({ config })

  const settings = await payload.findGlobal({
    slug: "site-settings",
  })

  const phone = settings?.phone as string | undefined

  return (
    <div className="mx-auto grid w-full gap-8 px-4 md:px-0 p-4">
      <h1 className="text-3xl font-semibold">Imprezy okolicznościowe</h1>

      <Card className="bg-muted/30 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.25)]">
        <CardHeader>
          <CardTitle>Urodziny, stypy, komunie, chrzciny…</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-2">
          <p className="text-muted-foreground">
            Sala z kącikiem dla dzieci, 2 tory do kręgli, bar.
            Chcesz zorganizować imprezę? Zadzwoń!
          </p>

          <p>
            <span className="font-medium">Zadzwoń:</span>{" "}
            {phone ? (
              <a href={`tel:${phone}`} className="underline">
                {phone}
              </a>
            ) : (
              "+48 XXX XXX XXX"
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
