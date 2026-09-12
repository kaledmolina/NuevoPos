import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"
import { requireSuperAdmin, hashPin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/seed — Carga completa de datos de demostración para plataforma SaaS Multi-Tenant.
// Exclusivo para Superadministrador.
// Genera empresas (tenants) aprobadas y pendientes, con múltiples sedes, administradores principales
// con correo/PIN, colaboradores vendedores con sedes asignadas, catálogos, sesiones de caja y ventas.
export async function POST(req: NextRequest) {
  const denied = requireSuperAdmin(req)
  if (denied) return denied

  const session = getSession(req)

  try {
    // 1. Conservar o crear el usuario Superadmin
    let superadmin = await db.user.findFirst({
      where: { role: "superadmin" },
    })
    if (!superadmin) {
      superadmin = await db.user.findFirst({
        where: { email: "kaledmoly@gmail.com" },
      })
    }
    if (!superadmin) {
      superadmin = await db.user.create({
        data: {
          name: "Superadmin Kaled",
          email: "kaledmoly@gmail.com",
          role: "superadmin",
          pinHash: hashPin("9999"),
          isPrimary: true,
          active: true,
          allowedBranchIds: "[]",
          tenantId: null,
        },
      })
    }

    // 2. Limpiar datos existentes respetando la integridad referencial
    await db.creditMovement.deleteMany()
    await db.creditAccount.deleteMany()
    await db.cashTransaction.deleteMany()
    await db.cashSession.deleteMany()
    await db.saleItem.deleteMany()
    await db.sale.deleteMany()
    await db.purchaseItem.deleteMany()
    await db.purchase.deleteMany()
    await db.transaction.deleteMany()
    await db.productBatch.deleteMany()
    await db.product.deleteMany()
    await db.category.deleteMany()
    await db.client.deleteMany()
    await db.supplier.deleteMany()

    // Eliminar todos los usuarios excepto Superadmin
    await db.user.deleteMany({
      where: { id: { not: superadmin.id } },
    })

    // Eliminar sedes y tenants existentes
    await db.branch.deleteMany()
    await db.tenant.deleteMany()

    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * day)

    // 3. Sede Central de Superadmin (sede global/independiente)
    const superBranch = await db.branch.create({
      data: {
        name: "Sede Central Superadmin",
        code: "SEDE-SAAS",
        address: "Oficinas Centrales SaaS",
        phone: "+57 300 000 0000",
        isMain: true,
        active: true,
        tenantId: null,
      },
    })

    // 4. TENANT 1: "Droguería San Jorge" (Aprobado, 2 Sedes, Admin + 2 Vendedores)
    const tenant1 = await db.tenant.create({
      data: {
        name: "Droguería San Jorge",
        slug: "drogueria-san-jorge",
        rubro: "drogueria",
        ownerName: "Carlos Restrepo",
        ownerEmail: "carlos@drogueriasanjorge.com",
        ownerPhone: "+57 300 123 4567",
        status: "aprobado",
        maxBranches: 3,
        approvedAt: now,
        approvedBy: "Superadmin Kaled",
        notes: "Cadena de droguerías con dos sucursales activas en zona centro y norte.",
      },
    })

    // Sedes Tenant 1
    const branch1Centro = await db.branch.create({
      data: {
        name: "San Jorge - Sede Centro",
        code: "DSJ-01",
        address: "Carrera 5 # 12-40, Centro",
        phone: "+57 300 123 4567",
        isMain: true,
        active: true,
        tenantId: tenant1.id,
      },
    })

    const branch1Norte = await db.branch.create({
      data: {
        name: "San Jorge - Sede Norte",
        code: "DSJ-02",
        address: "Calle 85 # 45-20, Norte",
        phone: "+57 301 987 6543",
        isMain: false,
        active: true,
        tenantId: tenant1.id,
      },
    })

    // Usuarios Tenant 1
    await db.user.create({
      data: {
        name: "carlos_admin",
        email: "carlos@drogueriasanjorge.com",
        role: "admin",
        pinHash: hashPin("1234"),
        isPrimary: true,
        allowedBranchIds: JSON.stringify([branch1Centro.id, branch1Norte.id]),
        tenantId: tenant1.id,
        active: true,
      },
    })

    await db.user.create({
      data: {
        name: "andres_vendedor",
        role: "vendedor",
        pinHash: hashPin("1111"),
        isPrimary: false,
        allowedBranchIds: JSON.stringify([branch1Centro.id]),
        tenantId: tenant1.id,
        active: true,
      },
    })

    await db.user.create({
      data: {
        name: "maria_vendedora",
        role: "vendedor",
        pinHash: hashPin("2222"),
        isPrimary: false,
        allowedBranchIds: JSON.stringify([branch1Norte.id]),
        tenantId: tenant1.id,
        active: true,
      },
    })

    // Categorías de Droguería
    const catsDrogueria = await Promise.all([
      db.category.create({ data: { name: "Medicamentos Éticos" } }),
      db.category.create({ data: { name: "Analgésicos & OTC" } }),
      db.category.create({ data: { name: "Cuidado Personal & Aseo" } }),
      db.category.create({ data: { name: "Primeros Auxilios" } }),
      db.category.create({ data: { name: "Vitaminas & Suplementos" } }),
    ])

    const catMapDrogueria = Object.fromEntries(catsDrogueria.map((c) => [c.name, c.id]))

    // Productos para Sede Centro
    const prodsCentroData = [
      { name: "Acetaminofén 500mg x 100 tab", cat: "Analgésicos & OTC", cost: 6500, price: 10500, stock: 45, min: 10, exp: 400, barcode: "7702001001", unit: "caja", location: "E1-A" },
      { name: "Ibuprofeno 800mg x 20 cap", cat: "Analgésicos & OTC", cost: 8200, price: 13900, stock: 30, min: 8, exp: 350, barcode: "7702001002", unit: "caja", location: "E1-A" },
      { name: "Amoxicilina 500mg x 50 cap", cat: "Medicamentos Éticos", cost: 14000, price: 21500, stock: 25, min: 5, exp: 280, barcode: "7702001003", unit: "caja", location: "E2-B" },
      { name: "Alcohol Antiséptico 700ml", cat: "Primeros Auxilios", cost: 4200, price: 6800, stock: 50, min: 15, exp: 600, barcode: "7702001004", unit: "frasco", location: "E3-C" },
      { name: "Gasa Estéril 7.5x7.5 x 100", cat: "Primeros Auxilios", cost: 5800, price: 9200, stock: 40, min: 10, exp: 500, barcode: "7702001005", unit: "paquete", location: "E3-C" },
      { name: "Suero Oral Electrolitos 500ml", cat: "Vitaminas & Suplementos", cost: 3500, price: 5800, stock: 60, min: 12, exp: 200, barcode: "7702001006", unit: "botella", location: "E4-D" },
      { name: "Vitamina C 500mg Masticable x 100", cat: "Vitaminas & Suplementos", cost: 12500, price: 19900, stock: 35, min: 8, exp: 365, barcode: "7702001007", unit: "frasco", location: "E4-D" },
      { name: "Jabón Líquido Antibacterial 500ml", cat: "Cuidado Personal & Aseo", cost: 6800, price: 10900, stock: 28, min: 6, exp: 450, barcode: "7702001008", unit: "unidad", location: "E5-E" },
    ]

    for (const p of prodsCentroData) {
      await db.product.create({
        data: {
          name: p.name,
          barcode: p.barcode,
          sku: p.barcode,
          categoryId: catMapDrogueria[p.cat] || catsDrogueria[0].id,
          cost: p.cost,
          price: p.price,
          stock: p.stock,
          minStock: p.min,
          unit: p.unit,
          expirationDate: d(p.exp),
          batch: `L-${Math.floor(Math.random() * 8000 + 1000)}`,
          location: p.location,
          branchId: branch1Centro.id,
        },
      })
    }

    // Productos para Sede Norte
    const prodsNorteData = [
      { name: "Acetaminofén 500mg x 100 tab", cat: "Analgésicos & OTC", cost: 6500, price: 10500, stock: 60, min: 15, exp: 420, barcode: "7702002001", unit: "caja", location: "N1-A" },
      { name: "Loratadina 10mg x 10 tab", cat: "Analgésicos & OTC", cost: 3200, price: 5500, stock: 40, min: 10, exp: 380, barcode: "7702002002", unit: "caja", location: "N1-A" },
      { name: "Azitromicina 500mg x 3 tab", cat: "Medicamentos Éticos", cost: 11000, price: 17500, stock: 30, min: 6, exp: 290, barcode: "7702002003", unit: "caja", location: "N2-B" },
      { name: "Protector Solar SPF 50 120g", cat: "Cuidado Personal & Aseo", cost: 24000, price: 38900, stock: 20, min: 5, exp: 500, barcode: "7702002004", unit: "tubo", location: "N3-C" },
      { name: "Termómetro Digital Punta Flexible", cat: "Primeros Auxilios", cost: 9500, price: 15900, stock: 18, min: 4, exp: 700, barcode: "7702002005", unit: "unidad", location: "N4-D" },
    ]

    for (const p of prodsNorteData) {
      await db.product.create({
        data: {
          name: p.name,
          barcode: p.barcode,
          sku: p.barcode,
          categoryId: catMapDrogueria[p.cat] || catsDrogueria[0].id,
          cost: p.cost,
          price: p.price,
          stock: p.stock,
          minStock: p.min,
          unit: p.unit,
          expirationDate: d(p.exp),
          batch: `L-${Math.floor(Math.random() * 8000 + 1000)}`,
          location: p.location,
          branchId: branch1Norte.id,
        },
      })
    }

    // Clientes Sede Centro y Norte
    const clientCentro = await db.client.create({
      data: {
        name: "María Gómez Morales",
        document: "52.341.890",
        phone: "+57 311 234 5678",
        email: "maria.gomez@test.com",
        address: "Calle 10 # 4-15",
        branchId: branch1Centro.id,
        isGeneric: false,
      },
    })

    await db.client.create({
      data: {
        name: "Cliente General Centro",
        isGeneric: true,
        branchId: branch1Centro.id,
      },
    })

    const clientNorte = await db.client.create({
      data: {
        name: "Juan Camilo Castro",
        document: "79.882.114",
        phone: "+57 315 889 2233",
        email: "juan.castro@test.com",
        address: "Calle 92 # 48-10",
        branchId: branch1Norte.id,
        isGeneric: false,
      },
    })

    await db.client.create({
      data: {
        name: "Cliente General Norte",
        isGeneric: true,
        branchId: branch1Norte.id,
      },
    })

    // Proveedores Droguería
    await db.supplier.create({
      data: {
        name: "Distribuidora Farmacéutica Andina",
        document: "900.822.451-2",
        phone: "+57 601 445 6789",
        email: "pedidos@farmandina.com",
        contactName: "Fernando Ruiz",
        branchId: branch1Centro.id,
      },
    })

    // Sesión de caja y ventas en Sede Centro
    const cashCentro = await db.cashSession.create({
      data: {
        branchId: branch1Centro.id,
        openingAmount: 150000,
        status: "abierta",
        openedBy: "andres_vendedor",
      },
    })

    const pCentro1 = await db.product.findFirst({ where: { branchId: branch1Centro.id, barcode: "7702001001" } })
    const pCentro2 = await db.product.findFirst({ where: { branchId: branch1Centro.id, barcode: "7702001004" } })

    if (pCentro1 && pCentro2) {
      const invCentro = "FAC-001-0001"
      const totalCentro = pCentro1.price * 2 + pCentro2.price * 1
      await db.sale.create({
        data: {
          invoiceNumber: invCentro,
          branchId: branch1Centro.id,
          clientId: clientCentro.id,
          subtotal: totalCentro,
          tax: 0,
          total: totalCentro,
          paymentMethod: "efectivo",
          amountReceived: totalCentro + 5000,
          change: 5000,
          status: "completada",
          cashSessionId: cashCentro.id,
          items: {
            create: [
              { productId: pCentro1.id, quantity: 2, unitPrice: pCentro1.price, unitCost: pCentro1.cost, subtotal: pCentro1.price * 2 },
              { productId: pCentro2.id, quantity: 1, unitPrice: pCentro2.price, unitCost: pCentro2.cost, subtotal: pCentro2.price },
            ],
          },
        },
      })
      await db.cashTransaction.create({
        data: {
          cashSessionId: cashCentro.id,
          type: "venta",
          amount: totalCentro,
          concept: `Venta ${invCentro}`,
          method: "efectivo",
        },
      })
      await db.product.update({ where: { id: pCentro1.id }, data: { stock: { decrement: 2 } } })
      await db.product.update({ where: { id: pCentro2.id }, data: { stock: { decrement: 1 } } })
    }

    // Sesión de caja y ventas en Sede Norte
    const cashNorte = await db.cashSession.create({
      data: {
        branchId: branch1Norte.id,
        openingAmount: 120000,
        status: "abierta",
        openedBy: "maria_vendedora",
      },
    })

    const pNorte1 = await db.product.findFirst({ where: { branchId: branch1Norte.id, barcode: "7702002004" } })
    if (pNorte1) {
      const invNorte = "FAC-002-0001"
      const totalNorte = pNorte1.price * 1
      await db.sale.create({
        data: {
          invoiceNumber: invNorte,
          branchId: branch1Norte.id,
          clientId: clientNorte.id,
          subtotal: totalNorte,
          tax: 0,
          total: totalNorte,
          paymentMethod: "tarjeta",
          amountReceived: totalNorte,
          change: 0,
          status: "completada",
          cashSessionId: cashNorte.id,
          items: {
            create: [
              { productId: pNorte1.id, quantity: 1, unitPrice: pNorte1.price, unitCost: pNorte1.cost, subtotal: pNorte1.price },
            ],
          },
        },
      })
      await db.cashTransaction.create({
        data: {
          cashSessionId: cashNorte.id,
          type: "venta",
          amount: totalNorte,
          concept: `Venta ${invNorte}`,
          method: "tarjeta",
        },
      })
      await db.product.update({ where: { id: pNorte1.id }, data: { stock: { decrement: 1 } } })
    }

    // 5. TENANT 2: "Minimarket Los Andes" (Aprobado, 1 Sede, Admin + 1 Vendedor)
    const tenant2 = await db.tenant.create({
      data: {
        name: "Minimarket Los Andes",
        slug: "minimarket-los-andes",
        rubro: "tienda",
        ownerName: "Andrea Méndez",
        ownerEmail: "andrea@losandes.com",
        ownerPhone: "+57 312 987 6543",
        status: "aprobado",
        maxBranches: 3,
        approvedAt: now,
        approvedBy: "Superadmin Kaled",
        notes: "Tienda y minimarket de barrio con abarrotes, bebidas y lácteos.",
      },
    })

    const branch2 = await db.branch.create({
      data: {
        name: "Los Andes - Sede Principal",
        code: "MLA-01",
        address: "Avenida Las Américas # 22-10",
        phone: "+57 312 987 6543",
        isMain: true,
        active: true,
        tenantId: tenant2.id,
      },
    })

    await db.user.create({
      data: {
        name: "andrea_admin",
        email: "andrea@losandes.com",
        role: "admin",
        pinHash: hashPin("1234"),
        isPrimary: true,
        allowedBranchIds: JSON.stringify([branch2.id]),
        tenantId: tenant2.id,
        active: true,
      },
    })

    await db.user.create({
      data: {
        name: "felipe_vendedor",
        role: "vendedor",
        pinHash: hashPin("3333"),
        isPrimary: false,
        allowedBranchIds: JSON.stringify([branch2.id]),
        tenantId: tenant2.id,
        active: true,
      },
    })

    const catsTienda = await Promise.all([
      db.category.create({ data: { name: "Abarrotes & Granos" } }),
      db.category.create({ data: { name: "Lácteos & Huevos" } }),
      db.category.create({ data: { name: "Bebidas & Refrescos" } }),
      db.category.create({ data: { name: "Snacks & Confitería" } }),
    ])

    const catMapTienda = Object.fromEntries(catsTienda.map((c) => [c.name, c.id]))

    const prodsTiendaData = [
      { name: "Arroz Diana 1kg", cat: "Abarrotes & Granos", cost: 3400, price: 4500, stock: 80, min: 20, exp: 300, barcode: "7703001001", unit: "bolsa" },
      { name: "Aceite Premier 1000ml", cat: "Abarrotes & Granos", cost: 8500, price: 11500, stock: 35, min: 10, exp: 250, barcode: "7703001002", unit: "botella" },
      { name: "Leche Entera 1L Colanta", cat: "Lácteos & Huevos", cost: 3600, price: 4700, stock: 50, min: 15, exp: 20, barcode: "7703001003", unit: "bolsa" },
      { name: "Huevos AA x 30", cat: "Lácteos & Huevos", cost: 14500, price: 18500, stock: 30, min: 8, exp: 25, barcode: "7703001004", unit: "panal" },
      { name: "Coca-Cola 1.5L", cat: "Bebidas & Refrescos", cost: 4300, price: 5800, stock: 60, min: 12, exp: 180, barcode: "7703001005", unit: "botella" },
      { name: "Papas Margarita Pollo 110g", cat: "Snacks & Confitería", cost: 3100, price: 4200, stock: 40, min: 10, exp: 90, barcode: "7703001006", unit: "paquete" },
    ]

    for (const p of prodsTiendaData) {
      await db.product.create({
        data: {
          name: p.name,
          barcode: p.barcode,
          sku: p.barcode,
          categoryId: catMapTienda[p.cat] || catsTienda[0].id,
          cost: p.cost,
          price: p.price,
          stock: p.stock,
          minStock: p.min,
          unit: p.unit,
          expirationDate: d(p.exp),
          batch: `L-${Math.floor(Math.random() * 8000 + 1000)}`,
          branchId: branch2.id,
        },
      })
    }

    await db.client.create({
      data: {
        name: "Cliente General Los Andes",
        isGeneric: true,
        branchId: branch2.id,
      },
    })

    const cashTienda = await db.cashSession.create({
      data: {
        branchId: branch2.id,
        openingAmount: 100000,
        status: "abierta",
        openedBy: "felipe_vendedor",
      },
    })

    const pTienda1 = await db.product.findFirst({ where: { branchId: branch2.id, barcode: "7703001001" } })
    if (pTienda1) {
      const invTienda = "FAC-AND-0001"
      const totalTienda = pTienda1.price * 3
      await db.sale.create({
        data: {
          invoiceNumber: invTienda,
          branchId: branch2.id,
          subtotal: totalTienda,
          tax: 0,
          total: totalTienda,
          paymentMethod: "efectivo",
          amountReceived: totalTienda,
          change: 0,
          status: "completada",
          cashSessionId: cashTienda.id,
          items: {
            create: [
              { productId: pTienda1.id, quantity: 3, unitPrice: pTienda1.price, unitCost: pTienda1.cost, subtotal: totalTienda },
            ],
          },
        },
      })
      await db.cashTransaction.create({
        data: {
          cashSessionId: cashTienda.id,
          type: "venta",
          amount: totalTienda,
          concept: `Venta ${invTienda}`,
          method: "efectivo",
        },
      })
      await db.product.update({ where: { id: pTienda1.id }, data: { stock: { decrement: 3 } } })
    }

    // 6. TENANT 3: "Ferretería El Tornillo" (Pendiente de Aprobación en Panel Superadmin)
    const tenant3 = await db.tenant.create({
      data: {
        name: "Ferretería El Tornillo",
        slug: "ferreteria-el-tornillo",
        rubro: "ferreteria",
        ownerName: "Javier Vargas",
        ownerEmail: "javier@eltornillo.com",
        ownerPhone: "+57 320 555 1234",
        status: "pendiente",
        maxBranches: 3,
        approvedAt: null,
        approvedBy: null,
        notes: "Solicitud de registro enviada desde la web. Pendiente por aprobar.",
      },
    })

    const branch3 = await db.branch.create({
      data: {
        name: "El Tornillo - Central",
        code: "FET-01",
        address: "Zona Industrial Lote 14",
        phone: "+57 320 555 1234",
        isMain: true,
        active: true,
        tenantId: tenant3.id,
      },
    })

    await db.user.create({
      data: {
        name: "javier_admin",
        email: "javier@eltornillo.com",
        role: "admin",
        pinHash: hashPin("1234"),
        isPrimary: true,
        allowedBranchIds: JSON.stringify([branch3.id]),
        tenantId: tenant3.id,
        active: false, // inactivo hasta aprobación
      },
    })

    // 7. Asociar la sede vacía del Superadmin
    await db.user.update({
      where: { id: superadmin.id },
      data: {
        allowedBranchIds: JSON.stringify([superBranch.id]),
        tenantId: null,
        active: true,
      },
    })

    // Cliente genérico para Superadmin
    await db.client.create({
      data: {
        name: "Cliente Genérico",
        isGeneric: true,
        branchId: superBranch.id,
      },
    })

    // Auditoría
    try {
      await logAudit({
        action: "seed",
        entityType: "system",
        userName: session?.name ?? superadmin.name,
        role: "superadmin",
        detail: "Datos demo SaaS generados: 3 empresas (Droguería San Jorge, Minimarket Los Andes, Ferretería El Tornillo), sedes asignadas, colaboradores con PIN y ventas de prueba.",
      })
    } catch {
      /* noop */
    }

    return NextResponse.json({
      ok: true,
      message: "Ecosistema demo SaaS multi-tenant generado exitosamente con 3 negocios (aprobados y pendientes), múltiples sedes, personal asignado y ventas.",
      tenants: [tenant1.name, tenant2.name, tenant3.name],
    })
  } catch (e) {
    console.error("Error en seed de datos demo:", e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
