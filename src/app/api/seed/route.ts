import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireSuperAdmin, hashPin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// POST /api/seed — Carga limpia y enfocada de datos de demostración SaaS:
// 1 Solo Negocio Demo ("Droguería & Farmacia La Salud")
// 1 Sola Sede Demo ("Sede Principal Demo")
// 2 Usuarios Demo:
//    - admin / PIN 1234 (Administrador total)
//    - vendedor / PIN 0000 (Vendedor caja y punto de venta)
// Y el Superadmin global (kaledmoly@gmail.com / PIN 9999).
// Incluye catálogo con stock, clientes, sesión de caja abierta, ventas reales e ingresos/gastos.
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
    } else {
      // Asegurar que el PIN esté activo y sea 9999
      await db.user.update({
        where: { id: superadmin.id },
        data: {
          pinHash: hashPin("9999"),
          active: true,
        },
      })
    }

    // 2. Limpiar datos demo previos con integridad referencial
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

    // Eliminar sedes y empresas previas
    await db.branch.deleteMany()
    await db.tenant.deleteMany()

    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * day)

    // 3. Sede Central exclusiva para Superadmin
    await db.branch.create({
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

    // 4. UN SOLO NEGOCIO DEMO (Tenant Oficial para Pruebas)
    const demoTenant = await db.tenant.create({
      data: {
        name: "Droguería & Farmacia La Salud",
        slug: "drogueria-la-salud-demo",
        rubro: "drogueria",
        ownerName: "Administrador Demo",
        ownerEmail: "admin@demo.com",
        ownerPhone: "+57 300 123 4567",
        status: "aprobado",
        maxBranches: 3,
        approvedAt: now,
        approvedBy: "Superadmin Kaled",
        notes: "Negocio de demostración oficial con 1 sede, catálogo completo y roles de Admin y Vendedor.",
      },
    })

    // 5. UNA SOLA SEDE DEMO
    const demoBranch = await db.branch.create({
      data: {
        name: "Sede Principal Demo",
        code: "SEDE-01",
        address: "Carrera 15 # 45-20, Zona Comercial",
        phone: "+57 300 123 4567",
        isMain: true,
        active: true,
        tenantId: demoTenant.id,
      },
    })

    // 6. LOS DOS ÚNICOS USUARIOS DEMO (Admin y Vendedor exactos del Login/Landing)
    const adminUser = await db.user.create({
      data: {
        name: "admin",
        email: "admin@demo.com",
        role: "admin",
        pinHash: hashPin("1234"),
        isPrimary: true,
        allowedBranchIds: JSON.stringify([demoBranch.id]),
        tenantId: demoTenant.id,
        active: true,
      },
    })

    const vendedorUser = await db.user.create({
      data: {
        name: "vendedor",
        email: "vendedor@demo.com",
        role: "vendedor",
        pinHash: hashPin("0000"),
        isPrimary: false,
        allowedBranchIds: JSON.stringify([demoBranch.id]),
        tenantId: demoTenant.id,
        active: true,
      },
    })

    // 7. Categorías de muestra
    const [catMedicamentos, catOTC, catAseo, catPrimerosAux, catVitaminas] = await Promise.all([
      db.category.create({ data: { name: "Medicamentos Éticos" } }),
      db.category.create({ data: { name: "Analgésicos & OTC" } }),
      db.category.create({ data: { name: "Cuidado Personal & Aseo" } }),
      db.category.create({ data: { name: "Primeros Auxilios" } }),
      db.category.create({ data: { name: "Vitaminas & Suplementos" } }),
    ])

    // 8. Productos de muestra con stock y precios
    const productsData = [
      {
        name: "Acetaminofén 500mg x 100 tab",
        barcode: "7702001001",
        categoryId: catOTC.id,
        cost: 6500,
        price: 10500,
        stock: 50,
        minStock: 10,
        unit: "caja",
        expirationDate: d(365),
        batch: "L-8821",
        location: "Estante A1",
        description: "Analgésico y antipirético de uso común.",
      },
      {
        name: "Ibuprofeno 800mg x 20 cap",
        barcode: "7702001002",
        categoryId: catOTC.id,
        cost: 8200,
        price: 13900,
        stock: 35,
        minStock: 8,
        unit: "caja",
        expirationDate: d(280),
        batch: "L-5412",
        location: "Estante A1",
        description: "Antiinflamatorio no esteroideo para dolores agudos.",
      },
      {
        name: "Amoxicilina 500mg x 50 cap",
        barcode: "7702001003",
        categoryId: catMedicamentos.id,
        cost: 14000,
        price: 21500,
        stock: 28,
        minStock: 6,
        unit: "caja",
        expirationDate: d(400),
        batch: "L-9910",
        location: "Estante B2",
        description: "Antibiótico de amplio espectro bajo fórmula médica.",
      },
      {
        name: "Alcohol Antiséptico 700ml",
        barcode: "7702001004",
        categoryId: catPrimerosAux.id,
        cost: 4200,
        price: 6800,
        stock: 60,
        minStock: 15,
        unit: "frasco",
        expirationDate: d(600),
        batch: "L-1120",
        location: "Estante C3",
        description: "Alcohol antiséptico al 70% para desinfección.",
      },
      {
        name: "Gasa Estéril 7.5x7.5 x 100",
        barcode: "7702001005",
        categoryId: catPrimerosAux.id,
        cost: 5800,
        price: 9200,
        stock: 45,
        minStock: 10,
        unit: "paquete",
        expirationDate: d(500),
        batch: "L-3341",
        location: "Estante C3",
        description: "Compresas de gasa estéril para curaciones.",
      },
      {
        name: "Suero Oral Electrolitos 500ml",
        barcode: "7702001006",
        categoryId: catVitaminas.id,
        cost: 3500,
        price: 5800,
        stock: 70,
        minStock: 12,
        unit: "botella",
        expirationDate: d(220),
        batch: "L-7740",
        location: "Nevera 1",
        description: "Solución de hidratación oral para rehidratación rápida.",
      },
      {
        name: "Vitamina C 500mg Masticable x 100",
        barcode: "7702001007",
        categoryId: catVitaminas.id,
        cost: 12500,
        price: 19900,
        stock: 40,
        minStock: 8,
        unit: "frasco",
        expirationDate: d(365),
        batch: "L-9042",
        location: "Mostrador 2",
        description: "Suplemento de vitamina C sabor naranja.",
      },
      {
        name: "Protector Solar Facial SPF 50 120g",
        barcode: "7702001008",
        categoryId: catAseo.id,
        cost: 22000,
        price: 36000,
        stock: 22,
        minStock: 5,
        unit: "tubo",
        expirationDate: d(450),
        batch: "L-6002",
        location: "Vitrina D1",
        description: "Protector solar toque seco con alta protección UV.",
      },
      {
        name: "Jabón Líquido Antibacterial 500ml",
        barcode: "7702001009",
        categoryId: catAseo.id,
        cost: 6800,
        price: 10900,
        stock: 30,
        minStock: 6,
        unit: "unidad",
        expirationDate: d(520),
        batch: "L-2219",
        location: "Estante E1",
        description: "Jabón suave antibacterial con dosificador.",
      },
      {
        name: "Pañitos Húmedos Antibacteriales x 80",
        barcode: "7702001010",
        categoryId: catAseo.id,
        cost: 5500,
        price: 8900,
        stock: 35,
        minStock: 8,
        unit: "paquete",
        expirationDate: d(380),
        batch: "L-4410",
        location: "Estante E1",
        description: "Toallitas húmedas desinfectantes sin alcohol.",
      },
    ]

    const createdProducts: Array<{ id: string; name: string; cost: number; price: number }> = []
    for (const p of productsData) {
      const prod = await db.product.create({
        data: {
          name: p.name,
          barcode: p.barcode,
          sku: p.barcode,
          categoryId: p.categoryId,
          cost: p.cost,
          price: p.price,
          stock: p.stock,
          minStock: p.minStock,
          unit: p.unit,
          expirationDate: p.expirationDate,
          batch: p.batch,
          location: p.location,
          description: p.description,
          branchId: demoBranch.id,
          active: true,
        },
      })
      createdProducts.push(prod)
    }

    // 9. Clientes de muestra
    const clientGenerico = await db.client.create({
      data: {
        name: "Cliente Mostrador (General)",
        isGeneric: true,
        branchId: demoBranch.id,
      },
    })

    const clientFrecuente = await db.client.create({
      data: {
        name: "Carlos Alberto Mendoza",
        document: "10.234.567",
        phone: "+57 310 555 1234",
        email: "carlos.mendoza@email.com",
        address: "Calle 18 # 7-42",
        branchId: demoBranch.id,
        isGeneric: false,
      },
    })

    // 10. Proveedor de muestra
    await db.supplier.create({
      data: {
        name: "Distribuidora Farmacéutica & Médica Andina",
        document: "900.822.451-2",
        phone: "+57 601 445 6789",
        email: "pedidos@farmandina.com",
        contactName: "Fernando Ruiz",
        branchId: demoBranch.id,
      },
    })

    // 11. Sesión de Caja Activa (Abierta por Vendedor con base de $150.000)
    const cashSession = await db.cashSession.create({
      data: {
        branchId: demoBranch.id,
        openingAmount: 150000,
        status: "abierta",
        openedBy: vendedorUser.name,
        notes: "Turno mañana - Caja Principal Demo",
      },
    })

    // 12. Ventas registradas de muestra (con datos reales para reportes)
    const p1 = createdProducts[0] // Acetaminofén ($10.500)
    const p2 = createdProducts[1] // Ibuprofeno ($13.900)
    const p4 = createdProducts[3] // Alcohol ($6.800)
    const p8 = createdProducts[7] // Protector Solar ($36.000)

    // Venta 1: Efectivo
    const totalVenta1 = p1.price * 2 + p2.price * 1 // 21000 + 13900 = 34900
    await db.sale.create({
      data: {
        invoiceNumber: "FAC-001-0001",
        branchId: demoBranch.id,
        clientId: clientFrecuente.id,
        subtotal: totalVenta1,
        tax: 0,
        total: totalVenta1,
        paymentMethod: "efectivo",
        amountReceived: 40000,
        change: 5100,
        status: "completada",
        cashSessionId: cashSession.id,
        items: {
          create: [
            { productId: p1.id, quantity: 2, unitPrice: p1.price, unitCost: p1.cost, subtotal: p1.price * 2 },
            { productId: p2.id, quantity: 1, unitPrice: p2.price, unitCost: p2.cost, subtotal: p2.price },
          ],
        },
      },
    })
    await db.cashTransaction.create({
      data: {
        cashSessionId: cashSession.id,
        type: "venta",
        amount: totalVenta1,
        concept: "Venta FAC-001-0001",
        method: "efectivo",
      },
    })
    await db.product.update({ where: { id: p1.id }, data: { stock: { decrement: 2 } } })
    await db.product.update({ where: { id: p2.id }, data: { stock: { decrement: 1 } } })

    // Venta 2: Nequi / Transferencia
    const totalVenta2 = p8.price * 1 // 36000
    await db.sale.create({
      data: {
        invoiceNumber: "FAC-001-0002",
        branchId: demoBranch.id,
        clientId: clientGenerico.id,
        subtotal: totalVenta2,
        tax: 0,
        total: totalVenta2,
        paymentMethod: "transferencia",
        amountReceived: totalVenta2,
        change: 0,
        status: "completada",
        cashSessionId: cashSession.id,
        items: {
          create: [
            { productId: p8.id, quantity: 1, unitPrice: p8.price, unitCost: p8.cost, subtotal: p8.price },
          ],
        },
      },
    })
    await db.cashTransaction.create({
      data: {
        cashSessionId: cashSession.id,
        type: "venta",
        amount: totalVenta2,
        concept: "Venta FAC-001-0002",
        method: "transferencia",
      },
    })
    await db.product.update({ where: { id: p8.id }, data: { stock: { decrement: 1 } } })

    // Venta 3: Tarjeta
    const totalVenta3 = p4.price * 2 // 13600
    await db.sale.create({
      data: {
        invoiceNumber: "FAC-001-0003",
        branchId: demoBranch.id,
        clientId: clientGenerico.id,
        subtotal: totalVenta3,
        tax: 0,
        total: totalVenta3,
        paymentMethod: "tarjeta",
        amountReceived: totalVenta3,
        change: 0,
        status: "completada",
        cashSessionId: cashSession.id,
        items: {
          create: [
            { productId: p4.id, quantity: 2, unitPrice: p4.price, unitCost: p4.cost, subtotal: p4.price * 2 },
          ],
        },
      },
    })
    await db.cashTransaction.create({
      data: {
        cashSessionId: cashSession.id,
        type: "venta",
        amount: totalVenta3,
        concept: "Venta FAC-001-0003",
        method: "tarjeta",
      },
    })
    await db.product.update({ where: { id: p4.id }, data: { stock: { decrement: 2 } } })

    // 13. Movimientos de Ingreso y Gasto de muestra
    await db.cashTransaction.create({
      data: {
        cashSessionId: cashSession.id,
        type: "ingreso",
        amount: 50000,
        concept: "Ingreso base sencillo adicional para cambio",
        method: "efectivo",
      },
    })

    await db.cashTransaction.create({
      data: {
        cashSessionId: cashSession.id,
        type: "egreso",
        amount: 18000,
        concept: "Compra menor: rollos de papel térmico y bolsas",
        method: "efectivo",
      },
    })

    // 14. Transacciones generales
    await db.transaction.create({
      data: {
        branchId: demoBranch.id,
        type: "egreso",
        category: "servicios",
        amount: 45000,
        concept: "Pago de internet y telefonía sede",
        method: "transferencia",
      },
    })

    // 15. Configuración del negocio sincronizada
    const defaultSettings: Record<string, string> = {
      store_name: "Droguería & Farmacia La Salud",
      store_rubro: "drogueria",
      store_nit: "901.234.567-8",
      store_phone: "+57 300 123 4567",
      store_address: "Carrera 15 # 45-20, Zona Comercial",
      receipt_message: "¡Gracias por su compra en Droguería La Salud! Conserve este recibo.",
    }

    for (const [key, value] of Object.entries(defaultSettings)) {
      await db.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    }

    if (session) {
      await logAudit({
        action: "SEED_DEMO_SAAS",
        entityType: "tenant",
        entityId: demoTenant.id,
        userName: session.name,
        role: session.role,
        detail: "Carga limpia de datos demo: 1 negocio demo, 1 sede demo, admin (1234) y vendedor (0000).",
      })
    }

    return NextResponse.json({
      ok: true,
      message: "Demostración SaaS cargada exitosamente: 1 sede con admin (PIN 1234), vendedor (PIN 0000), productos, caja y ventas de prueba.",
      summary: {
        tenant: demoTenant.name,
        branch: demoBranch.name,
        users: [
          { name: "admin", pin: "1234", role: "admin" },
          { name: "vendedor", pin: "0000", role: "vendedor" },
        ],
        productsCount: productsData.length,
        salesCount: 3,
        cashSessionStatus: "abierta ($150.000)",
      },
    })
  } catch (error) {
    console.error("Error al cargar demo SaaS:", error)
    return NextResponse.json(
      { error: "Error al generar datos de demostración: " + (error as Error).message },
      { status: 500 }
    )
  }
}
