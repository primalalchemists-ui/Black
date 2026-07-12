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
        { status: { equals: "planned" } },
      ],
    },
    sort: "startsAt",
  })

  const eventIds = res.docs.map((e: any) => String(e.id))

  // Count taken seats per event in a single separate query (avoids deadlock from afterRead hook)
  const takenSeatsMap: Record<string, number> = {}
  if (eventIds.length > 0) {
    try {
      const reservations = await payload.find({
        collection: "reservations",
        limit: 0,
        pagination: false,
        overrideAccess: true,
        depth: 0,
        where: {
          and: [
            { event: { in: eventIds } },
            { status: { in: ["new", "confirmed"] } },
          ],
        },
        select: { event: true, partySize: true } as any,
      })
      for (const r of reservations.docs as any[]) {
        const eid = String(r.event?.id ?? r.event ?? "")
        if (eid) {
          takenSeatsMap[eid] = (takenSeatsMap[eid] ?? 0) + (Number(r.partySize) || 0)
        }
      }
    } catch {
      // leave takenSeatsMap empty — takenSeats defaults to 0
    }
  }

  return NextResponse.json({
    events: res.docs.map((e: any) => ({
      id: String(e.id),
      title: e.title,
      description: e.description ?? null,
      kind: e.kind ?? null,
      pricePLN: e.pricePLN ?? null,
      startsAt: e.startsAt,
      endsAt: e.endsAt ?? null,
      day: e.day ?? null,
      allDay: e.allDay ?? null,
      startHour: e.startHour ?? null,
      startMinute: e.startMinute ?? null,
      endHour: e.endHour ?? null,
      endMinute: e.endMinute ?? null,
      capacity: e.capacity ?? null,
      takenSeats: takenSeatsMap[String(e.id)] ?? 0,
      registrationsEnabled: e.registrationsEnabled ?? null,
      showOnHomepage: e.showOnHomepage ?? false,

      imageUrl: e.image?.url ?? null,
      imageAlt: e.image?.alt ?? e.title ?? "Wydarzenie",
    })),
  })
}
