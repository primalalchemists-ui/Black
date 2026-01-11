import { NextResponse } from "next/server"
import { getPayload } from "payload"
import config from "@payload-config"

export async function GET() {
  const payload = await getPayload({ config })

  const res = await payload.find({
    collection: "events",
    depth: 2,
    limit: 50,
    where: {
      and: [
        { published: { equals: true } },
        { registrationsEnabled: { equals: true } },
        { status: { equals: "planned" } },
      ],
    },
    sort: "startsAt",
  })

  return NextResponse.json({
    events: res.docs.map((e: any) => ({
      id: String(e.id),
      title: e.title,
      description: e.description ?? null,
      kind: e.kind ?? null,
      pricePLN: e.pricePLN ?? null,
      startsAt: e.startsAt,
      endsAt: e.endsAt ?? null,
      capacity: e.capacity ?? null,

      // jeśli event nie ma obrazka → null → front weźmie fallback
      imageUrl: e.image?.url ?? null,
      imageAlt: e.image?.alt ?? e.title ?? "Wydarzenie",
    })),
  })
}
