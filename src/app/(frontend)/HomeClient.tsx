import HomePageClient from "@/components/home/HomePageClient"

async function getSiteSettings() {
  const baseUrl = process.env.PAYLOAD_PUBLIC_SERVER_URL
  if (!baseUrl) return {}

  const res = await fetch(`${baseUrl}/api/globals/site-settings`, {
    next: { revalidate: 60 },
  })

  if (!res.ok) return {}
  return res.json()
}

export default async function Page() {
  const settings = await getSiteSettings()
  return <HomePageClient settings={settings} />
}
