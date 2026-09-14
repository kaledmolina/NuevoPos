import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

const db = new PrismaClient()

const SECRET = process.env.AUTH_SECRET || "drogueria-pos-dev-fallback-secret"

function hashPin(pin) {
  return crypto.createHmac("sha256", SECRET).update(`pin:${pin}`).digest("hex")
}

async function main() {
  console.log("🌱 Verificando inicialización de datos y Superadmin...")

  // 1. Verificar si ya existe el Superadmin
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
    // Asegurar que el PIN esté sincronizado con el AUTH_SECRET actual
    await db.user.update({
      where: { id: superadmin.id },
      data: {
        pinHash: hashPin("9999"),
        active: true,
      },
    })
    console.log("✅ Superadmin verificado y PIN actualizado.")
  }

  // 2. Verificar si hay al menos una sede central o un negocio demo
  const tenantCount = await db.tenant.count()
  if (tenantCount === 0) {
    console.log("🏢 Inicializando datos iniciales de demostración SaaS...")
    const now = new Date()

    // Sede global
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

    // Tenant Demo: Droguería San Jorge
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

    // Usuarios del Tenant 1 (Admin y Vendedor)
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

    // Categorías y productos demo
    const cat = await db.category.create({ data: { name: "Medicamentos & OTC" } })
    await db.product.create({
      data: {
        name: "Acetaminofén 500mg x 100 tab",
        barcode: "7702001001",
        sku: "7702001001",
        categoryId: cat.id,
        cost: 6500,
        price: 10500,
        stock: 50,
        minStock: 10,
        unit: "caja",
        branchId: branch1Centro.id,
      },
    })

    console.log("🎉 Datos demo creados exitosamente.")
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
