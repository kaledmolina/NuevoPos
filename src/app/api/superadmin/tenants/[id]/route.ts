import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// PATCH /api/superadmin/tenants/[id] - Aprobar, habilitar o inhabilitar un negocio
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const { id } = await context.params

  try {
    const body = await req.json()
    let action = body.action as "approve" | "disable" | "enable" | "update_limit" | undefined
    if (!action && body.status) {
      if (body.status === "inactivo") action = "disable"
      else if (body.status === "aprobado") action = "enable"
      else if (body.status === "pendiente") action = "disable"
    }

    const tenant = await db.tenant.findUnique({
      where: { id },
      include: { users: true },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
    }

    if (action === "approve") {
      // 1. Aprobar negocio y activar al administrador principal
      const updatedTenant = await db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: {
            status: "aprobado",
            approvedAt: new Date(),
            approvedBy: session?.name || "Superadmin",
          },
        })

        // Activar el usuario principal del negocio
        await tx.user.updateMany({
          where: { tenantId: id, isPrimary: true },
          data: { active: true },
        })

        return t
      })

      try {
        await logAudit({
          action: "tenant_approve",
          entityType: "tenant",
          entityId: id,
          userName: session?.name || "Superadmin",
          role: "superadmin",
          detail: `Negocio aprobado: "${tenant.name}" (${tenant.ownerEmail})`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `El negocio "${tenant.name}" ha sido aprobado exitosamente. Su administrador ya puede iniciar sesión.`,
        tenant: updatedTenant,
      })
    }

    if (action === "disable") {
      // 2. Inhabilitar acceso al negocio
      const updatedTenant = await db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: { status: "inactivo" },
        })

        // Inhabilitar temporalmente a los usuarios del negocio (excepto Superadmin)
        await tx.user.updateMany({
          where: {
            tenantId: id,
            role: { not: "superadmin" },
            OR: [{ email: null }, { email: { not: "kaledmoly@gmail.com" } }],
          },
          data: { active: false },
        })

        return t
      })

      try {
        await logAudit({
          action: "tenant_disable",
          entityType: "tenant",
          entityId: id,
          userName: session?.name || "Superadmin",
          role: "superadmin",
          detail: `Acceso inhabilitado para el negocio: "${tenant.name}"`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `El acceso para el negocio "${tenant.name}" y todo su personal ha sido inhabilitado.`,
        tenant: updatedTenant,
      })
    }

    if (action === "enable") {
      // 3. Rehabilitar acceso al negocio
      const updatedTenant = await db.$transaction(async (tx) => {
        const t = await tx.tenant.update({
          where: { id },
          data: { status: "aprobado" },
        })

        // Reactivar al administrador principal
        await tx.user.updateMany({
          where: { tenantId: id, isPrimary: true },
          data: { active: true },
        })

        return t
      })

      try {
        await logAudit({
          action: "tenant_enable",
          entityType: "tenant",
          entityId: id,
          userName: session?.name || "Superadmin",
          role: "superadmin",
          detail: `Acceso reactivado para el negocio: "${tenant.name}"`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `El acceso para el negocio "${tenant.name}" ha sido restaurado exitosamente.`,
        tenant: updatedTenant,
      })
    }

    if (action === "update_limit") {
      const maxBranches = Math.max(1, Math.min(10, Number(body.maxBranches ?? 3)))
      const updatedTenant = await db.tenant.update({
        where: { id },
        data: { maxBranches },
      })
      return NextResponse.json({ ok: true, tenant: updatedTenant })
    }

    return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 })
  } catch (e) {
    console.error("[superadmin/tenants/patch] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export const PUT = PATCH

// DELETE /api/superadmin/tenants/[id] - Eliminar empresa demo y todos sus datos (ventas, productos, sedes, personal)
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  const { id } = await context.params

  try {
    const tenant = await db.tenant.findUnique({
      where: { id },
      include: { branches: true },
    })

    if (!tenant) {
      return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const dataOnly = searchParams.get("dataOnly") === "true"

    const branchIds = tenant.branches.map((b) => b.id)

    await db.$transaction(async (tx) => {
      // 1. Clientes y créditos de las sedes del negocio
      if (branchIds.length > 0) {
        const clients = await tx.client.findMany({
          where: { branchId: { in: branchIds } },
          select: { id: true },
        })
        const clientIds = clients.map((c) => c.id)

        if (clientIds.length > 0) {
          const accounts = await tx.creditAccount.findMany({
            where: { clientId: { in: clientIds } },
            select: { id: true },
          })
          const accountIds = accounts.map((a) => a.id)
          if (accountIds.length > 0) {
            await tx.creditMovement.deleteMany({ where: { accountId: { in: accountIds } } })
            await tx.creditAccount.deleteMany({ where: { id: { in: accountIds } } })
          }
        }

        // 2. Ventas e ítems de venta
        const sales = await tx.sale.findMany({
          where: { branchId: { in: branchIds } },
          select: { id: true },
        })
        const saleIds = sales.map((s) => s.id)
        if (saleIds.length > 0) {
          await tx.creditMovement.deleteMany({ where: { saleId: { in: saleIds } } })
          await tx.cashTransaction.deleteMany({ where: { reference: { in: saleIds } } })
          await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } })
          await tx.sale.deleteMany({ where: { id: { in: saleIds } } })
        }

        // 3. Compras e ítems de compra
        const purchases = await tx.purchase.findMany({
          where: { branchId: { in: branchIds } },
          select: { id: true },
        })
        const purchaseIds = purchases.map((p) => p.id)
        if (purchaseIds.length > 0) {
          await tx.purchaseItem.deleteMany({ where: { purchaseId: { in: purchaseIds } } })
          await tx.purchase.deleteMany({ where: { id: { in: purchaseIds } } })
        }

        // 4. Cajas y transacciones
        const cashSessions = await tx.cashSession.findMany({
          where: { branchId: { in: branchIds } },
          select: { id: true },
        })
        const sessionIds = cashSessions.map((cs) => cs.id)
        if (sessionIds.length > 0) {
          await tx.cashTransaction.deleteMany({ where: { cashSessionId: { in: sessionIds } } })
          await tx.cashSession.deleteMany({ where: { id: { in: sessionIds } } })
        }

        // 5. Lotes y Productos
        const products = await tx.product.findMany({
          where: { branchId: { in: branchIds } },
          select: { id: true },
        })
        const productIds = products.map((p) => p.id)
        if (productIds.length > 0) {
          await tx.saleItem.deleteMany({ where: { productId: { in: productIds } } })
          await tx.purchaseItem.deleteMany({ where: { productId: { in: productIds } } })
          await tx.productBatch.deleteMany({ where: { productId: { in: productIds } } })
          await tx.product.deleteMany({ where: { id: { in: productIds } } })
        }

        // 6. Clientes y Proveedores de las sedes
        await tx.client.deleteMany({ where: { branchId: { in: branchIds } } })
        await tx.supplier.deleteMany({ where: { branchId: { in: branchIds } } })
      }

      // Si no es solo datos, eliminar usuarios, sedes y tenant
      if (!dataOnly) {
        await tx.user.deleteMany({
          where: {
            tenantId: id,
            role: { not: "superadmin" },
          },
        })
        await tx.branch.deleteMany({
          where: { tenantId: id },
        })
        await tx.tenant.delete({
          where: { id },
        })
      }
    })

    try {
      await logAudit({
        action: dataOnly ? "tenant_data_purge" : "tenant_delete",
        entityType: "tenant",
        entityId: id,
        userName: session?.name || "Superadmin",
        role: "superadmin",
        detail: dataOnly
          ? `Purga de ventas y productos de prueba del negocio "${tenant.name}"`
          : `Negocio demo "${tenant.name}" y todos sus datos/usuarios eliminados permanentemente`,
      })
    } catch {
      // noop
    }

    return NextResponse.json({
      ok: true,
      message: dataOnly
        ? `Se han purgado todas las ventas y productos de prueba del negocio "${tenant.name}".`
        : `El negocio "${tenant.name}" y todos sus datos de prueba han sido eliminados correctamente.`,
    })
  } catch (e) {
    console.error("[superadmin/tenants/delete] error:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}


