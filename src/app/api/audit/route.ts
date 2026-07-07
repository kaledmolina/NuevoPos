import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// GET /api/audit — lista los logs de auditoría (solo admin)
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500)
  const action = searchParams.get("action")
  const userName = searchParams.get("user")

  const where: Record<string, unknown> = {}
  if (action) where.action = action
  if (userName) where.userName = { contains: userName }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return NextResponse.json(logs)
}
