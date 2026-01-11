import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

export async function GET() {
  const payload = await getPayload({ config });

  const [billiard, lane] = await Promise.all([
    payload.find({
      collection: "resources",
      where: { and: [{ type: { equals: "billiard" } }, { active: { equals: true } }] },
      limit: 0,
    }),
    payload.find({
      collection: "resources",
      where: { and: [{ type: { equals: "lane" } }, { active: { equals: true } }] },
      limit: 0,
    }),
  ]);

  return NextResponse.json({
    billiardCount: billiard.totalDocs ?? 0,
    laneCount: lane.totalDocs ?? 0,
  });
}
