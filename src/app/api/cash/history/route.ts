import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { resolveBranchId } from "@/lib/branch"

export const dynamic = "force-dynamic"

// Listar todas las sesiones (historial) por sede
export async function GET(req: NextRequest) {
  const branchId = await resolveBranchId(req)
  const sessions = await db.cashSession.findMany({
    where: branchId ? { branchId } : {},
    orderBy: { openedAt: "desc" },
    include: { _count: { select: { transactions: true } } },
    take: 100,
  })
  return NextResponse.json(sessions)
}
