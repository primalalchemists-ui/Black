import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

function mapType(t: string | null) {
  if (t === "bilard") return "billiard";
  if (t === "kregle") return "lane";
  return null;
}

export async function GET(req: Request) {
  const payload = await getPayload({ config });

  const { searchParams } = new URL(req.url);
  const type = mapType(searchParams.get("type"));

  if (!type) {
    return NextResponse.json({ error: "BAD_TYPE" }, { status: 400 });
  }

  const res = await payload.find({
    collection: "resources",
    limit: 200,
    where: {
      and: [{ type: { equals: type } }, { active: { equals: true } }],
    },
    sort: "number",
  });

  return NextResponse.json({
    resources: res.docs.map((r: any) => ({
      id: String(r.id),
      number: r.number,
      label: r.label,
    })),
  });
}
