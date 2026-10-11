import HomePageClient from "@/components/home/HomePageClient"
import { headers } from "next/headers"
import { internalFetchHeaders } from "@/lib/stagingAccess"

async function getSiteSettings() {
  // bierzemy aktualny host z requestu — działa i lokalnie, i na Railway
  const h = await headers()
  const host = h.get("host")
  if (!host) return {}

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
  const baseUrl = `${protocol}://${host}`

  const res = await fetch(`${baseUrl}/api/globals/site-settings`, {
    // Patrz komentarz w src/lib/siteSettings.ts — bramka stagingowa.
    headers: internalFetchHeaders(),
    next: { revalidate: 60 },
  })

  if (!res.ok) return {}
  return res.json()
}

export default async function Page() {
  const settings = await getSiteSettings()
  return <HomePageClient settings={settings} />
}
