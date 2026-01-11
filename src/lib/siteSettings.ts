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
  const baseUrl = process.env.PAYLOAD_URL || "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/globals/site-settings`, {
    next: { revalidate: 60 },
  })

  if (!res.ok) return {}
  return res.json()
}
