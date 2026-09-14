import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

const db = new PrismaClient()

const SECRET = process.env.AUTH_SECRET || "drogueria-pos-dev-fallback-secret"

function hashPin(pin) {
  return crypto.createHmac("sha256", SECRET).update(`pin:${pin}`).digest("hex")
}

async function main() {
  console.log("🌱 Verificando inicialización de datos y Superadmin...")

  // 1. Verificar o crear el Superadmin
  let superadmin = await db.user.findFirst({
    where: {
      OR: [
        { role: "superadmin" },
        { email: "kaledmoly@gmail.com" },
      ],
    },
  })

  if (!superadmin) {
    console.log("👑 Creando Superadmin (kaledmoly@gmail.com / PIN 9999)...")
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
    console.log("✅ Superadmin creado con éxito.")
  } else {
    await db.user.update({
      where: { id: superadmin.id },
      data: {
        pinHash: hashPin("9999"),
        active: true,
      },
    })
    console.log("✅ Superadmin verificado y PIN actualizado a 9999.")
  }

  // 2. Verificar si hay al menos una empresa/tenant demo
  const tenantCount = await db.tenant.count()
  if (tenantCount === 0) {
    console.log("🏢 Inicializando datos de demostración limpios (1 Sede, Admin y Vendedor)...")
    const now = new Date()
    const d = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

    // Sede global Superadmin
    await db.branch.create({
      data: {
        name: "Sede Central Superadmin",
        code: "SEDE-SAAS",
        address: "Oficinas Centrales",
        phone: "+57 300 000 0000",
        isMain: true,
        active: true,
        tenantId: null,
      },
    })

    // 1 Solo Tenant Demo
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
        notes: "Negocio demo oficial preconfigurado para pruebas de clientes y demostraciones.",
      },
    })

    // 1 Sola Sede Demo
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

    // 2 Usuarios Demo: Admin (1234) y Vendedor (0000)
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

    // Categorías de muestra
    const [catOTC, catAseo, catPrimerosAux, catVitaminas] = await Promise.all([
      db.category.create({ data: { name: "Analgésicos & OTC" } }),
      db.category.create({ data: { name: "Cuidado Personal & Aseo" } }),
      db.category.create({ data: { name: "Primeros Auxilios" } }),
      db.category.create({ data: { name: "Vitaminas & Suplementos" } }),
    ])

    // Productos de muestra
    const productsData = [
      { name: "Acetaminofén 500mg x 100 tab", barcode: "7702001001", catId: catOTC.id, cost: 6500, price: 10500, stock: 50, unit: "caja" },
      { name: "Ibuprofeno 800mg x 20 cap", barcode: "7702001002", catId: catOTC.id, cost: 8200, price: 13900, stock: 35, unit: "caja" },
      { name: "Alcohol Antiséptico 700ml", barcode: "7702001004", catId: catPrimerosAux.id, cost: 4200, price: 6800, stock: 60, unit: "frasco" },
      { name: "Gasa Estéril 7.5x7.5 x 100", barcode: "7702001005", catId: catPrimerosAux.id, cost: 5800, price: 9200, stock: 45, unit: "paquete" },
      { name: "Suero Oral Electrolitos 500ml", barcode: "7702001006", catId: catVitaminas.id, cost: 3500, price: 5800, stock: 70, unit: "botella" },
      { name: "Protector Solar Facial SPF 50", barcode: "7702001008", catId: catAseo.id, cost: 22000, price: 36000, stock: 20, unit: "tubo" },
    ]

    const createdProds = []
    for (const p of productsData) {
      const prod = await db.product.create({
        data: {
          name: p.name,
          barcode: p.barcode,
          sku: p.barcode,
          categoryId: p.catId,
          cost: p.cost,
          price: p.price,
          stock: p.stock,
          minStock: 10,
          unit: p.unit,
          expirationDate: d(365),
          batch: "L-1001",
          location: "Estante Principal",
          branchId: demoBranch.id,
          active: true,
        },
      })
      createdProds.push(prod)
    }

    // Cliente de muestra
    const client = await db.client.create({
      data: {
        name: "Cliente Mostrador (General)",
        isGeneric: true,
        branchId: demoBranch.id,
      },
    })

    // Sesión de caja abierta
    const cash = await db.cashSession.create({
      data: {
        branchId: demoBranch.id,
        openingAmount: 150000,
        status: "abierta",
        openedBy: vendedorUser.name,
        notes: "Turno mañana Demo",
      },
    })

    // Venta inicial de prueba
    const p1 = createdProds[0]
    const total = p1.price * 2
    await db.sale.create({
      data: {
        invoiceNumber: "FAC-001-0001",
        branchId: demoBranch.id,
        clientId: client.id,
        subtotal: total,
        tax: 0,
        total: total,
        paymentMethod: "efectivo",
        amountReceived: total,
        change: 0,
        status: "completada",
        cashSessionId: cash.id,
        items: {
          create: [{ productId: p1.id, quantity: 2, unitPrice: p1.price, unitCost: p1.cost, subtotal: total }],
        },
      },
    })
    await db.cashTransaction.create({
      data: {
        cashSessionId: cash.id,
        type: "venta",
        amount: total,
        concept: "Venta FAC-001-0001",
        method: "efectivo",
      },
    })
    await db.product.update({ where: { id: p1.id }, data: { stock: { decrement: 2 } } })

    console.log("🎉 Datos demo limpios creados: admin (1234) y vendedor (0000) en 1 sede.")
  }

  console.log("✨ Base de datos lista.")
}

main()
  .catch((e) => {
    console.error("❌ Error en seed automático:", e)
  })
  .finally(async () => {
    await db.$disconnect()
  })
