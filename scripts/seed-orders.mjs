import { PrismaClient } from "@prisma/client"
import crypto from "crypto"

const prisma = new PrismaClient()
const FALLBACK_SECRET = "drogueria-pos-dev-fallback-secret"
const SECRET = process.env.AUTH_SECRET || FALLBACK_SECRET

function hashPin(pin) {
  return crypto.createHmac("sha256", SECRET).update(`pin:${pin}`).digest("hex")
}

async function main() {
  const tenant = await prisma.tenant.findFirst()
  if (!tenant) {
    console.log("No tenant found!")
    return
  }
  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id } })
  const products = await prisma.product.findMany({ where: { active: true }, take: 4 })

  console.log("Tenant:", tenant.name, "Branch:", branch?.name)

  // 1. Crear domiciliario de demostración si no existe
  let driverUser = await prisma.user.findFirst({ where: { role: "domiciliario" } })
  if (!driverUser) {
    driverUser = await prisma.user.create({
      data: {
        name: "Andrés Repartidor",
        email: "repartidor@demo.com",
        role: "domiciliario",
        pinHash: hashPin("1234"),
        tenantId: tenant.id,
        allowedBranchIds: branch ? JSON.stringify([branch.id]) : "[]",
        active: true,
      },
    })
    console.log("Created demo driver user:", driverUser.name)
  } else {
    console.log("Existing demo driver user:", driverUser.name)
  }

  // 2. Crear pedidos de muestra si no existen
  const existingCount = await prisma.order.count()
  if (existingCount === 0 && products.length >= 2) {
    const p1 = products[0]
    const p2 = products[1]

    // Pedido 1: Pendiente (Sin conductor)
    await prisma.order.create({
      data: {
        orderNumber: "PED-20261105-1001",
        tenantId: tenant.id,
        branchId: branch?.id,
        customerName: "Mariana Gómez",
        customerPhone: "3104567890",
        customerEmail: "mariana.gomez@gmail.com",
        deliveryAddress: "Calle 72 # 11-45, Torre B Apto 402",
        deliveryNotes: "Timbre blanco, edificio frente al parque",
        paymentMethod: "contraentrega",
        paymentStatus: "pendiente",
        status: "pendiente",
        notes: "Urgente, para persona mayor",
        subtotal: p1.price * 2,
        deliveryFee: 4000,
        total: p1.price * 2 + 4000,
        items: {
          create: [
            {
              productId: p1.id,
              productName: p1.name,
              quantity: 2,
              unitPrice: p1.price,
              subtotal: p1.price * 2,
            },
          ],
        },
      },
    })

    // Pedido 2: Confirmado / En preparación (Listo para asignar conductor)
    await prisma.order.create({
      data: {
        orderNumber: "PED-20261105-1002",
        tenantId: tenant.id,
        branchId: branch?.id,
        customerName: "Carlos Arango",
        customerPhone: "3187654321",
        customerEmail: "carlos.arango@hotmail.com",
        deliveryAddress: "Carrera 15 # 93-20, Oficina 301",
        deliveryNotes: "Recepción empresarial, llamar al llegar",
        paymentMethod: "contraentrega",
        paymentStatus: "pendiente",
        status: "en_preparacion",
        notes: "Paga con billete de $50.000 (llevar cambio)",
        subtotal: p2.price,
        deliveryFee: 3500,
        total: p2.price + 3500,
        items: {
          create: [
            {
              productId: p2.id,
              productName: p2.name,
              quantity: 1,
              unitPrice: p2.price,
              subtotal: p2.price,
            },
          ],
        },
      },
    })

    // Pedido 3: En camino (Con conductor asignado)
    await prisma.order.create({
      data: {
        orderNumber: "PED-20261105-1003",
        tenantId: tenant.id,
        branchId: branch?.id,
        customerName: "Laura Restrepo",
        customerPhone: "3001239876",
        customerEmail: "laura.res@gmail.com",
        deliveryAddress: "Diagonal 45 # 19-33, Casa 4",
        deliveryNotes: "Dejar en portería si no contestan",
        paymentMethod: "transferencia",
        paymentStatus: "pagado",
        status: "en_camino",
        notes: "Transferencia verificada",
        deliveryDriverId: driverUser.id,
        deliveryDriverName: driverUser.name,
        deliveryDriverPhone: "3154445566",
        assignedAt: new Date(Date.now() - 20 * 60 * 1000),
        dispatchedAt: new Date(Date.now() - 15 * 60 * 1000),
        subtotal: p1.price + p2.price,
        deliveryFee: 3000,
        total: p1.price + p2.price + 3000,
        items: {
          create: [
            {
              productId: p1.id,
              productName: p1.name,
              quantity: 1,
              unitPrice: p1.price,
              subtotal: p1.price,
            },
            {
              productId: p2.id,
              productName: p2.name,
              quantity: 1,
              unitPrice: p2.price,
              subtotal: p2.price,
            },
          ],
        },
      },
    })

    console.log("Created 3 initial sample orders!")
  } else {
    console.log("Orders already exist:", existingCount)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
