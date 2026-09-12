import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET /api/purchases/[id] — detalle de una compra
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const purchase = await db.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    })
    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 })
    }

    const session = getSession(req)
    if (session && purchase.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, purchase.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para consultar compras de esta sede." },
          { status: 403 }
        )
      }
    }

    return NextResponse.json(purchase)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// PATCH /api/purchases/[id] — anular compra (reversa stock, sin bajar de 0)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req)
  if (denied) return denied
  const session = getSession(req)
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const purchase = await db.purchase.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 })
    }

    if (session && purchase.branchId) {
      const { canUserAccessBranch } = await import("@/lib/branch")
      const hasAccess = await canUserAccessBranch(session.uid, purchase.branchId)
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Acceso denegado: No tienes autorización para gestionar compras de esta sede." },
          { status: 403 }
        )
      }
    }

    if (body.status === "anulada" && purchase.status !== "anulada") {
      await db.$transaction(async (tx) => {
        // Reversar el stock incrementado, sin bajar de 0
        for (const it of purchase.items) {
          const product = await tx.product.findUnique({
            where: { id: it.productId },
            select: { stock: true },
          })
          if (!product) continue
          const newStock = Math.max(0, product.stock - it.quantity)
          await tx.product.update({
            where: { id: it.productId },
            data: { stock: newStock },
          })
        }
        await tx.purchase.update({
          where: { id },
          data: { status: "anulada" },
        })
      })

      const updated = await db.purchase.findUnique({
        where: { id },
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
      })
      const session = getSession(req)
      try {
        await logAudit({
          action: "purchase_annul",
          entityType: "purchase",
          entityId: id,
          userName: session?.name ?? "Sistema",
          role: session?.role ?? "admin",
          detail: "Compra anulada",
        })
      } catch {
        // noop: logging failure must not break the operation
      }
      return NextResponse.json(updated)
    }

    return NextResponse.json(purchase)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
