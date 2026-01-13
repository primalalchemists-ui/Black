import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"

export async function GET() {
  const payload = await getPayload({ config })

  try {
    // ✅ KLUCZ: route jest publiczny, ale global ma read tylko dla staff/admin,
    // więc na serwerze robimy overrideAccess
    const settings = await payload.findGlobal({
      slug: "reservation-settings",
      depth: 2,
      overrideAccess: true,
    })

    const rel = settings?.regulationsPdf
    let pdfUrl: string | undefined

    // upload relation jako obiekt media
    if (rel && typeof rel === "object" && (rel as any).url) {
      pdfUrl = (rel as any).url as string
    }
    // upload relation jako id
    else if (typeof rel === "string") {
      const media = await payload.findByID({
        collection: "media",
        id: rel,
        overrideAccess: true,
      })
      pdfUrl = (media as any)?.url as string | undefined
    }

    if (!pdfUrl) {
      return new NextResponse("<h1>Regulamin niedostępny (brak pliku)</h1>", {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }

    // ✅ absolutny URL (w dev i prod)
    const origin = (process.env.PAYLOAD_URL || "http://localhost:3000").replace(/\/$/, "")
    const absoluteUrl = pdfUrl.startsWith("http") ? pdfUrl : `${origin}${pdfUrl.startsWith("/") ? "" : "/"}${pdfUrl}`

    const upstream = await fetch(absoluteUrl)

    if (!upstream.ok || !upstream.body) {
      return new NextResponse(
        `<h1>Nie udało się pobrać PDF</h1><p>Status: ${upstream.status}</p><p>URL: ${absoluteUrl}</p>`,
        { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } }
      )
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="regulamin.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err: any) {
    return new NextResponse(
      `<h1>Nie udało się pobrać PDF</h1><pre>${String(err?.message || err)}</pre>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    )
  }
}
