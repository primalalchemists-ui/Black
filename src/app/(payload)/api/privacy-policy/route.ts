import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"
import { internalFetchHeaders } from "@/lib/stagingAccess"

export async function GET() {
  const payload = await getPayload({ config })

  try {
    const settings = await payload.findGlobal({
      slug: "reservation-settings",
      depth: 2,
      overrideAccess: true,
    })

    const rel = settings?.privacyPolicyPdf
    let pdfUrl: string | undefined

    if (rel && typeof rel === "object" && (rel as any).url) {
      pdfUrl = (rel as any).url as string
    } else if (typeof rel === "string") {
      const media = await payload.findByID({
        collection: "media",
        id: rel,
        overrideAccess: true,
      })
      pdfUrl = (media as any)?.url as string | undefined
    }

    if (!pdfUrl) {
      return new NextResponse("<h1>Polityka prywatności niedostępna</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }

    const origin = (process.env.PAYLOAD_URL || "http://localhost:3000").replace(/\/$/, "")
    const absoluteUrl = pdfUrl.startsWith("http")
      ? pdfUrl
      : `${origin}${pdfUrl.startsWith("/") ? "" : "/"}${pdfUrl}`

    // Naglowek bramki stagingowej TYLKO dla wlasnego origin. Gdy plik lezy
    // w S3 (pdfUrl zaczyna sie od http), nie wysylamy klucza do obcego hosta.
    const sameOrigin = !pdfUrl.startsWith("http")
    const upstream = await fetch(absoluteUrl, sameOrigin ? { headers: internalFetchHeaders() } : undefined)

    if (!upstream.ok || !upstream.body) {
      return new NextResponse("<h1>Nie udało się pobrać PDF</h1>", { status: 502 })
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="polityka-prywatnosci.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err: any) {
    return new NextResponse(
      `<h1>Błąd</h1><pre>${String(err?.message || err)}</pre>`,
      { status: 500 }
    )
  }
}