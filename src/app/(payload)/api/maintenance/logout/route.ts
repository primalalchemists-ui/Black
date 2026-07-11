import { NextRequest, NextResponse } from "next/server"
import { MAINTENANCE_COOKIE } from "@/lib/maintenanceAuth"

export const dynamic = "force-dynamic"

export async function POST(_req: NextRequest) {
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } })
  res.cookies.delete(MAINTENANCE_COOKIE)
  return res
}

export async function GET(_req: NextRequest) {
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } })
  res.cookies.delete(MAINTENANCE_COOKIE)
  return res
}
