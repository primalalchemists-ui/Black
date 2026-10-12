import { NextRequest, NextResponse } from "next/server"
import { STAGING_COOKIE, isStagingProtectionEnabled } from "@/lib/stagingAccess"

export const dynamic = "force-dynamic"

function clear(): NextResponse {
  // Jak w /api/staging/login: poza stagingiem trasa nie istnieje.
  if (!isStagingProtectionEnabled()) {
    return new NextResponse(null, { status: 404 })
  }

  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } })
  res.cookies.delete(STAGING_COOKIE)
  return res
}

export async function POST(_req: NextRequest) {
  return clear()
}

export async function GET(_req: NextRequest) {
  return clear()
}
