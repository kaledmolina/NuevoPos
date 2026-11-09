import { NextRequest, NextResponse } from "next/server"
import { syncMetaCloudTemplates } from "@/lib/meta-whatsapp-policy"
import { requireBranchAccess } from "@/lib/branch"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const branchAccess = await requireBranchAccess(req)
    const branchId = branchAccess instanceof NextResponse ? null : branchAccess.branchId

    const body = await req.json().catch(() => ({}))
    const explicitWabaId = body?.wabaId

    const res = await syncMetaCloudTemplates(branchId, explicitWabaId)

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: res.error,
          syncedCount: res.syncedCount,
          requiresWabaId: !!res.requiresWabaId,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: res.message || `Se sincronizaron ${res.syncedCount} plantillas oficiales desde Meta Cloud API.`,
      syncedCount: res.syncedCount,
      wabaId: res.wabaId,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    )
  }
}
