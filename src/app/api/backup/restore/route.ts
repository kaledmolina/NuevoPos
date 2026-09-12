import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireAdmin, getSession, logAudit } from "@/lib/auth"
import { getDatabasePath } from "@/lib/db"
import fs from "fs"
import path from "path"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/backup/restore — restaura un backup específico:
// - Para Admin regular: restaura ÚNICAMENTE los datos de sus tiendas/sedes a partir del JSON del backup, sin tocar a ningún otro negocio ni al Superadmin.
// - Para Superadmin: permite restaurar la base de datos SQLite (.db) completa.
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  const session = getSession(req)
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const backupName = String(body.backup ?? "").trim()
    if (!backupName || backupName.includes("..") || backupName.includes("/") || backupName.includes("\\")) {
      return NextResponse.json({ error: "Nombre de backup inválido" }, { status: 400 })
    }

    const dbPath = getDatabasePath()

    // CASO 1: Administrador regular (Aislamiento Multi-Tenant)
    if (session.role !== "superadmin") {
      const tenantId = session.tenantId
      if (!tenantId) {
        return NextResponse.json({ error: "No perteneces a ningún negocio para restaurar datos" }, { status: 403 })
      }

      const tenantDir = path.join(path.dirname(dbPath), "backups", "tenants", tenantId)
      const backupPath = path.join(tenantDir, backupName)

      if (!fs.existsSync(backupPath)) {
        return NextResponse.json({ error: "La copia de seguridad no existe en tu negocio" }, { status: 404 })
      }

      const fileContent = fs.readFileSync(backupPath, "utf-8")
      let backupData: any
      try {
        backupData = JSON.parse(fileContent)
      } catch {
        return NextResponse.json({ error: "El archivo de respaldo está dañado o no es un JSON válido" }, { status: 400 })
      }

      if (backupData.type !== "tenant_backup") {
        return NextResponse.json({ error: "El archivo no corresponde a una copia de seguridad de tienda" }, { status: 400 })
      }

      // Crear respaldo preventivo antes de restaurar
      const ts = new Date().toISOString().replace(/[:.]/g, "-")
      const preRestorePath = path.join(tenantDir, `pre-restore-${ts}.json`)
      try {
        fs.copyFileSync(backupPath, preRestorePath)
      } catch {
        /* noop */
      }

      // Obtener sedes actuales de este tenant
      let branches = await db.branch.findMany({ where: { tenantId } })
      if (branches.length === 0) {
        const b = await db.branch.create({
          data: {
            name: "Sede Principal",
            code: "SEDE-01",
            isMain: true,
            active: true,
            tenantId,
          },
        })
        branches = [b]
      }
      const currentBranchIds = branches.map((b) => b.id)
      const mainBranchId = branches.find((b) => b.isMain)?.id || branches[0].id

      // Limpiar ÚNICAMENTE datos operativos de este tenant
      await db.cashTransaction.deleteMany({
        where: { cashSession: { branchId: { in: currentBranchIds } } },
      })
      await db.cashSession.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })
      await db.saleItem.deleteMany({
        where: { sale: { branchId: { in: currentBranchIds } } },
      })
      await db.sale.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })
      await db.purchaseItem.deleteMany({
        where: { purchase: { branchId: { in: currentBranchIds } } },
      })
      await db.purchase.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })
      await db.creditMovement.deleteMany({
        where: { account: { client: { branchId: { in: currentBranchIds } } } },
      })
      await db.creditAccount.deleteMany({
        where: { client: { branchId: { in: currentBranchIds } } },
      })
      await db.client.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })
      await db.supplier.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })
      await db.productBatch.deleteMany({
        where: { product: { branchId: { in: currentBranchIds } } },
      })
      await db.product.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })
      await db.transaction.deleteMany({
        where: { branchId: { in: currentBranchIds } },
      })

      // Mapear branchId
      const branchIdMap: Record<string, string> = {}
      if (Array.isArray(backupData.branches)) {
        for (const oldB of backupData.branches) {
          const match = branches.find((b) => b.code === oldB.code || b.name === oldB.name)
          branchIdMap[oldB.id] = match ? match.id : mainBranchId
        }
      }

      const resolveBranchId = (oldId?: string | null) => {
        if (!oldId) return mainBranchId
        return branchIdMap[oldId] || (currentBranchIds.includes(oldId) ? oldId : mainBranchId)
      }

      // Categorías
      if (Array.isArray(backupData.categories)) {
        for (const cat of backupData.categories) {
          const exists = await db.category.findFirst({ where: { name: cat.name } })
          if (!exists) {
            await db.category.create({ data: { name: cat.name } })
          }
        }
      }
      const allCategories = await db.category.findMany()
      const catMap = Object.fromEntries(allCategories.map((c) => [c.name, c.id]))

      // Productos
      const productIdMap: Record<string, string> = {}
      if (Array.isArray(backupData.products)) {
        for (const p of backupData.products) {
          const created = await db.product.create({
            data: {
              name: p.name,
              barcode: p.barcode,
              sku: p.sku,
              cost: Number(p.cost) || 0,
              price: Number(p.price) || 0,
              stock: Number(p.stock) || 0,
              minStock: Number(p.minStock) || 5,
              unit: p.unit || "unidad",
              location: p.location,
              expirationDate: p.expirationDate ? new Date(p.expirationDate) : null,
              batch: p.batch,
              active: p.active !== false,
              branchId: resolveBranchId(p.branchId),
              categoryId: catMap[p.category?.name] || allCategories[0]?.id || null,
            },
          })
          productIdMap[p.id] = created.id

          if (Array.isArray(p.batches)) {
            for (const b of p.batches) {
              await db.productBatch.create({
                data: {
                  productId: created.id,
                  batch: b.batch,
                  stock: Number(b.stock) || 0,
                  cost: Number(b.cost) || 0,
                  expirationDate: b.expirationDate ? new Date(b.expirationDate) : null,
                },
              })
            }
          }
        }
      }

      // Clientes
      const clientIdMap: Record<string, string> = {}
      if (Array.isArray(backupData.clients) && backupData.clients.length > 0) {
        for (const c of backupData.clients) {
          const created = await db.client.create({
            data: {
              name: c.name,
              document: c.document,
              phone: c.phone,
              email: c.email,
              address: c.address,
              notes: c.notes,
              isGeneric: Boolean(c.isGeneric),
              branchId: resolveBranchId(c.branchId),
            },
          })
          clientIdMap[c.id] = created.id

          if (c.creditAccount) {
            const ca = await db.creditAccount.create({
              data: {
                clientId: created.id,
                creditLimit: Number(c.creditAccount.creditLimit) || 0,
                balance: Number(c.creditAccount.balance) || 0,
                active: c.creditAccount.active !== false,
              },
            })
            if (Array.isArray(c.creditAccount.movements)) {
              for (const m of c.creditAccount.movements) {
                await db.creditMovement.create({
                  data: {
                    accountId: ca.id,
                    type: m.type,
                    amount: Number(m.amount) || 0,
                    concept: m.concept || "Movimiento",
                    method: m.method || "efectivo",
                    reportedBy: m.reportedBy,
                    previousBalance: m.previousBalance,
                    remainingBalance: m.remainingBalance,
                    createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                  },
                })
              }
            }
          }
        }
      } else {
        await db.client.create({
          data: {
            name: "Cliente Genérico",
            isGeneric: true,
            branchId: mainBranchId,
          },
        })
      }

      // Proveedores
      const supplierIdMap: Record<string, string> = {}
      if (Array.isArray(backupData.suppliers)) {
        for (const s of backupData.suppliers) {
          const created = await db.supplier.create({
            data: {
              name: s.name,
              document: s.document,
              phone: s.phone,
              email: s.email,
              address: s.address,
              contactName: s.contactName,
              notes: s.notes,
              branchId: resolveBranchId(s.branchId),
            },
          })
          supplierIdMap[s.id] = created.id
        }
      }

      // Cajas y Ventas
      const cashSessionIdMap: Record<string, string> = {}
      if (Array.isArray(backupData.cashSessions)) {
        for (const cs of backupData.cashSessions) {
          const created = await db.cashSession.create({
            data: {
              branchId: resolveBranchId(cs.branchId),
              openingAmount: Number(cs.openingAmount) || 0,
              closingAmount: cs.closingAmount !== null ? Number(cs.closingAmount) : null,
              expectedAmount: cs.expectedAmount !== null ? Number(cs.expectedAmount) : null,
              difference: cs.difference !== null ? Number(cs.difference) : null,
              status: cs.status || "cerrada",
              openedAt: cs.openedAt ? new Date(cs.openedAt) : new Date(),
              closedAt: cs.closedAt ? new Date(cs.closedAt) : null,
              openedBy: cs.openedBy,
              closedBy: cs.closedBy,
              notes: cs.notes,
            },
          })
          cashSessionIdMap[cs.id] = created.id

          if (Array.isArray(cs.transactions)) {
            for (const tx of cs.transactions) {
              await db.cashTransaction.create({
                data: {
                  cashSessionId: created.id,
                  type: tx.type,
                  amount: Number(tx.amount) || 0,
                  concept: tx.concept,
                  method: tx.method || "efectivo",
                  reference: tx.reference,
                  createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
                },
              })
            }
          }
        }
      }

      if (Array.isArray(backupData.sales)) {
        for (const sale of backupData.sales) {
          const createdSale = await db.sale.create({
            data: {
              invoiceNumber: sale.invoiceNumber,
              clientId: sale.clientId ? clientIdMap[sale.clientId] || null : null,
              branchId: resolveBranchId(sale.branchId),
              subtotal: Number(sale.subtotal) || 0,
              tax: Number(sale.tax) || 0,
              discount: Number(sale.discount) || 0,
              total: Number(sale.total) || 0,
              paymentMethod: sale.paymentMethod || "efectivo",
              amountReceived: Number(sale.amountReceived) || 0,
              change: Number(sale.change) || 0,
              status: sale.status || "completada",
              cashSessionId: sale.cashSessionId ? cashSessionIdMap[sale.cashSessionId] || null : null,
              notes: sale.notes,
              createdAt: sale.createdAt ? new Date(sale.createdAt) : new Date(),
            },
          })

          if (Array.isArray(sale.items)) {
            for (const it of sale.items) {
              const newProdId = productIdMap[it.productId]
              if (newProdId) {
                await db.saleItem.create({
                  data: {
                    saleId: createdSale.id,
                    productId: newProdId,
                    quantity: Number(it.quantity) || 1,
                    unitPrice: Number(it.unitPrice) || 0,
                    unitCost: Number(it.unitCost) || 0,
                    subtotal: Number(it.subtotal) || 0,
                  },
                })
              }
            }
          }
        }
      }

      // Compras
      if (Array.isArray(backupData.purchases)) {
        for (const pur of backupData.purchases) {
          const createdPur = await db.purchase.create({
            data: {
              reference: pur.reference,
              supplierId: pur.supplierId ? supplierIdMap[pur.supplierId] || null : null,
              branchId: resolveBranchId(pur.branchId),
              subtotal: Number(pur.subtotal) || 0,
              tax: Number(pur.tax) || 0,
              total: Number(pur.total) || 0,
              status: pur.status || "recibida",
              notes: pur.notes,
              createdAt: pur.createdAt ? new Date(pur.createdAt) : new Date(),
            },
          })

          if (Array.isArray(pur.items)) {
            for (const it of pur.items) {
              const newProdId = productIdMap[it.productId]
              if (newProdId) {
                await db.purchaseItem.create({
                  data: {
                    purchaseId: createdPur.id,
                    productId: newProdId,
                    quantity: Number(it.quantity) || 1,
                    unitCost: Number(it.unitCost) || 0,
                    subtotal: Number(it.subtotal) || 0,
                    expirationDate: it.expirationDate ? new Date(it.expirationDate) : null,
                    batch: it.batch,
                  },
                })
              }
            }
          }
        }
      }

      // Transacciones generales
      if (Array.isArray(backupData.transactions)) {
        for (const tx of backupData.transactions) {
          await db.transaction.create({
            data: {
              branchId: resolveBranchId(tx.branchId),
              type: tx.type,
              category: tx.category || "General",
              amount: Number(tx.amount) || 0,
              concept: tx.concept,
              description: tx.description,
              method: tx.method || "efectivo",
              date: tx.date ? new Date(tx.date) : new Date(),
              cashSessionId: tx.cashSessionId ? cashSessionIdMap[tx.cashSessionId] || null : null,
              createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
            },
          })
        }
      }

      try {
        await logAudit({
          action: "backup_restore",
          entityType: "tenant",
          entityId: tenantId,
          userName: session.name,
          role: session.role,
          detail: `Copia de seguridad de tienda restaurada exitosamente: ${backupName}`,
        })
      } catch {
        /* noop */
      }

      return NextResponse.json({
        ok: true,
        message: `Copia de seguridad restaurada exitosamente para ${backupData.tenantName || "tu negocio"}. Se recomienda recargar la página.`,
      })
    }

    // CASO 2: Superadministrador (Restauración de SQLite .db global)
    if (!/^(backup|upload|pre-restore)-[\w.-]+\.db$/.test(backupName)) {
      return NextResponse.json({ error: "Nombre de backup inválido para restauración global" }, { status: 400 })
    }

    const backupDir = path.join(path.dirname(dbPath), "backups")
    const backupPath = path.join(backupDir, backupName)

    if (!fs.existsSync(backupPath)) {
      return NextResponse.json({ error: "El backup global no existe" }, { status: 404 })
    }

    const preRestoreBackup = path.join(
      backupDir,
      `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.db`
    )
    try {
      fs.copyFileSync(dbPath, preRestoreBackup)
    } catch {
      /* noop */
    }

    fs.copyFileSync(backupPath, dbPath)

    try {
      await logAudit({
        action: "backup_restore",
        entityType: "system",
        userName: session.name,
        role: session.role,
        detail: `Backup global SQLite restaurado: ${backupName}`,
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: `Backup global ${backupName} restaurado correctamente. Se recomienda recargar la página.`,
    })
  } catch (e) {
    console.error("Error al restaurar backup:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
