import { NextRequest } from "next/server"
import { requireRole } from "@/lib/auth"
import { getUserAllowedBranches } from "@/lib/branch"
import { apiSuccess, apiError } from "@/lib/api-response"
import { buildDriverSettlementReport } from "@/lib/driver-settlement"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authResult = requireRole(req, ["domiciliario", "vendedor", "admin", "superadmin"])
    if (authResult instanceof Response) return authResult

    const { session } = authResult
    const { searchParams } = new URL(req.url)

    const range = searchParams.get("range") || "all"
    const requestedDriverId = searchParams.get("driverId")

    const headerBranchId = req.headers.get("x-branch-id")
    const queryBranchId = searchParams.get("branchId")
    const rawBranchId =
      queryBranchId && queryBranchId !== "null" && queryBranchId !== "undefined"
        ? queryBranchId
        : headerBranchId && headerBranchId !== "null" && headerBranchId !== "undefined"
        ? headerBranchId
        : null

    const allowedBranches = await getUserAllowedBranches(session.uid)
    let resolvedBranchId: string | null = null

    if (rawBranchId === "all") {
      resolvedBranchId = null
    } else if (rawBranchId) {
      if (session.role !== "superadmin" && !allowedBranches.includes(rawBranchId)) {
        return apiError("No tienes autorización para consultar cuadres de esta sede.", 403)
      }
      resolvedBranchId = rawBranchId
    } else if (session.role !== "superadmin") {
      resolvedBranchId = allowedBranches[0] || null
    }

    const report = await buildDriverSettlementReport({
      session,
      branchId: resolvedBranchId,
      range,
      driverId: requestedDriverId,
    })

    return apiSuccess({
      role: session.role,
      range,
      branch: report.branch,
      cashRegisterOpen: Boolean(report.openSession),
      openSession: report.openSession,
      summary: report.summary,
      mySettlement: report.mySettlement,
      drivers: report.drivers,
      history: report.history,
    })
  } catch (error) {
    console.error("Error en GET /api/v1/delivery/settlement:", error)
    return apiError("Error al consultar resumen y cuadre del domiciliario", 500)
  }
}
