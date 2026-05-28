export type OpeningHour = {
  key: string
  label: string
  open: string
  close: string
}

export type SiteSettings = {
  id?: number
  name?: string
  slogan?: string
  description?: string
  phone?: string
  email?: string
  address?: string
  facebook?: string
  instagram?: string
  openingHours?: OpeningHour[]
}

export async function getSiteSettings(): Promise<SiteSettings> {
  let baseUrl = process.env.PAYLOAD_URL

  if (!baseUrl) {
    const { headers } = await import("next/headers")
    const h = await headers()
    const host = h.get("host")
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http"
    baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000"
  }

  const res = await fetch(`${baseUrl}/api/globals/site-settings`, {
    next: { revalidate: 60 },
  })

  if (!res.ok) return {}
  return res.json()
}
