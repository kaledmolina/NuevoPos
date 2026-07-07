import { NextRequest, NextResponse } from "next/server"
import { clearSessionCookie, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = getSession(req)
  const userName = session?.name ?? "Sistema"
  const role = session?.role ?? "admin"
  try {
    await logAudit({
      action: "logout",
      entityType: "user",
      userName,
      role,
      detail: "Cierre de sesión",
    })
  } catch {
    // noop: logging failure must not break logout
  }
  const res = NextResponse.json({ ok: true })
  return clearSessionCookie(res)
}
