import { NextResponse } from "next/server"
import { clearSessionCookie } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  return clearSessionCookie(res)
}
