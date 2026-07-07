import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"
import { requireAdmin, hashPin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied
  try {
    // Limpiar datos existentes
    await db.cashTransaction.deleteMany()
    await db.cashSession.deleteMany()
    await db.saleItem.deleteMany()
    await db.sale.deleteMany()
    await db.purchaseItem.deleteMany()
    await db.purchase.deleteMany()
    await db.transaction.deleteMany()
    await db.product.deleteMany()
    await db.category.deleteMany()
    await db.client.deleteMany()
    await db.supplier.deleteMany()
    await db.setting.deleteMany()

    // Configuración de la tienda
    await db.setting.createMany({
      data: [
        { key: "store_name", value: "Droguería La Salud" },
        { key: "store_nit", value: "900.123.456-7" },
        { key: "store_phone", value: "+57 310 555 0100" },
        { key: "store_address", value: "Calle 45 # 23-18, Bogotá" },
        { key: "tax_rate", value: "0" },
        { key: "currency", value: "COP" },
      ],
    })

    // Categorías
    const catNames = [
      "Analgésicos",
      "Antibióticos",
      "Antialérgicos",
      "Gastrointestinal",
      "Vitaminas",
      "Cuidado Personal",
      "Primeros Auxilios",
      "Bebés y Maternidad",
    ]
    const cats = await Promise.all(
      catNames.map((name) => db.category.create({ data: { name } }))
    )
    const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]))

    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * day)

    // Productos con vencimientos variados
    const products = [
      { name: "Acetaminofén 500mg x 10", cat: "Analgésicos", cost: 1200, price: 2800, stock: 240, min: 40, exp: 200, barcode: "7702001000011", unit: "caja" },
      { name: "Ibuprofeno 400mg x 10", cat: "Analgésicos", cost: 1800, price: 4200, stock: 12, min: 30, exp: 18, barcode: "7702001000028", unit: "caja" },
      { name: "Naproxeno 250mg x 14", cat: "Analgésicos", cost: 3200, price: 6800, stock: 60, min: 20, exp: 90, barcode: "7702001000035", unit: "caja" },
      { name: "Dolex 500mg x 10", cat: "Analgésicos", cost: 2400, price: 5900, stock: 8, min: 25, exp: -3, barcode: "7702001000042", unit: "caja" },
      { name: "Amoxicilina 500mg x 12", cat: "Antibióticos", cost: 4500, price: 9800, stock: 35, min: 15, exp: 25, barcode: "7702001000059", unit: "caja" },
      { name: "Azitromicina 500mg x 3", cat: "Antibióticos", cost: 8200, price: 16500, stock: 20, min: 10, exp: 120, barcode: "7702001000066", unit: "caja" },
      { name: "Ciprofloxacino 500mg x 10", cat: "Antibióticos", cost: 3800, price: 8400, stock: 4, min: 12, exp: 14, barcode: "7702001000073", unit: "caja" },
      { name: "Loratadina 10mg x 10", cat: "Antialérgicos", cost: 2200, price: 5400, stock: 80, min: 20, exp: 300, barcode: "7702001000080", unit: "caja" },
      { name: "Cetirizina 10mg x 10", cat: "Antialérgicos", cost: 2600, price: 6100, stock: 50, min: 20, exp: 28, barcode: "7702001000097", unit: "caja" },
      { name: "Omeprazol 20mg x 14", cat: "Gastrointestinal", cost: 3400, price: 7900, stock: 90, min: 25, exp: 150, barcode: "7702001000103", unit: "caja" },
      { name: "Sal de Uvas Picot sobres x 10", cat: "Gastrointestinal", cost: 2800, price: 6200, stock: 6, min: 20, exp: 10, barcode: "7702001000110", unit: "caja" },
      { name: "Alka-Seltzer x 12", cat: "Gastrointestinal", cost: 4100, price: 9100, stock: 40, min: 15, exp: 220, barcode: "7702001000127", unit: "caja" },
      { name: "Complejo B x 30", cat: "Vitaminas", cost: 5200, price: 12500, stock: 55, min: 15, exp: 365, barcode: "7702001000134", unit: "frasco" },
      { name: "Vitamina C 1g x 10 efervescente", cat: "Vitaminas", cost: 3600, price: 8400, stock: 70, min: 20, exp: 45, barcode: "7702001000141", unit: "tubo" },
      { name: "Vitamina D3 1000UI x 30", cat: "Vitaminas", cost: 6100, price: 13900, stock: 30, min: 12, exp: 400, barcode: "7702001000158", unit: "frasco" },
      { name: "Alcohol antiséptico 750ml", cat: "Primeros Auxilios", cost: 4500, price: 9900, stock: 100, min: 20, exp: null, barcode: "7702001000165", unit: "botella" },
      { name: "Gasas estériles x 10", cat: "Primeros Auxilios", cost: 800, price: 2200, stock: 200, min: 30, exp: null, barcode: "7702001000172", unit: "paquete" },
      { name: "Vendas elásticas 10cm", cat: "Primeros Auxilios", cost: 1900, price: 4500, stock: 45, min: 15, exp: null, barcode: "7702001000189", unit: "unidad" },
      { name: "Curitas x 50", cat: "Primeros Auxilios", cost: 2600, price: 6100, stock: 3, min: 15, exp: null, barcode: "7702001000196", unit: "caja" },
      { name: "Jabón antibacterial 200g", cat: "Cuidado Personal", cost: 3200, price: 7200, stock: 65, min: 20, exp: 540, barcode: "7702001000202", unit: "unidad" },
      { name: "Shampoo anticaspa 350ml", cat: "Cuidado Personal", cost: 9800, price: 18900, stock: 28, min: 10, exp: 600, barcode: "7702001000219", unit: "botella" },
      { name: "Crema hidratante 120ml", cat: "Cuidado Personal", cost: 8400, price: 17500, stock: 22, min: 10, exp: 35, barcode: "7702001000226", unit: "tubo" },
      { name: "Papel higiénico x 4", cat: "Cuidado Personal", cost: 4800, price: 9900, stock: 90, min: 25, exp: null, barcode: "7702001000233", unit: "paquete" },
      { name: "Pañales bebé talla M x 30", cat: "Bebés y Maternidad", cost: 21000, price: 35900, stock: 18, min: 8, exp: null, barcode: "7702001000240", unit: "paquete" },
      { name: "Fórmula láctea 400g", cat: "Bebés y Maternidad", cost: 18500, price: 32900, stock: 14, min: 6, exp: 60, barcode: "7702001000257", unit: "lata" },
      { name: "Baby shampoo 200ml", cat: "Bebés y Maternidad", cost: 7600, price: 15200, stock: 9, min: 8, exp: 22, barcode: "7702001000264", unit: "botella" },
    ]

    await db.product.createMany({
      data: products.map((p) => ({
        name: p.name,
        barcode: p.barcode,
        sku: p.barcode,
        categoryId: catMap[p.cat],
        cost: p.cost,
        price: p.price,
        stock: p.stock,
        minStock: p.min,
        unit: p.unit,
        expirationDate: p.exp === null ? null : d(p.exp),
        batch: `L${Math.floor(Math.random() * 9000 + 1000)}`,
        location: `E${Math.floor(Math.random() * 10) + 1}`,
      })),
    })

    // Clientes
    await db.client.createMany({
      data: [
        { name: "María González", document: "1029384756", phone: "3105550111" },
        { name: "Carlos Restrepo", document: "1038475629", phone: "3115550222" },
        { name: "Ana Martínez", document: "1047563829", phone: "3125550333" },
        { name: "Jorge Ramírez", document: "31556677", phone: "3135550444" },
        { name: "Farmacia La Esperanza", document: "900.456.789-1", phone: "3145550555" },
        { name: "Cliente Genérico", document: null, phone: null },
      ],
    })

    // Proveedores
    await db.supplier.createMany({
      data: [
        { name: "Distribuciones Farma S.A.S", document: "900.111.222-3", phone: "6015550011", contactName: "Pedro Díaz" },
        { name: "Laboratorios Baxter Colombia", document: "830.222.333-4", phone: "6015550022", contactName: "Lucía Torres" },
        { name: "Cofarma", document: "860.333.444-5", phone: "6015550033", contactName: "Andrés Gómez" },
        { name: "Grupo Sabaneta Pharma", document: "900.444.555-6", phone: "6045550044", contactName: "Sandra López" },
      ],
    })

    // Sesión de caja abierta
    await db.cashSession.create({
      data: { openingAmount: 100000, status: "abierta", openedBy: "Administrador" },
    })

    // Una venta de ejemplo
    const acet = await db.product.findFirst({ where: { name: { startsWith: "Acetaminofén" } } })
    const lora = await db.product.findFirst({ where: { name: { startsWith: "Loratadina" } } })
    const lastSale = await db.sale.findFirst({ orderBy: { invoiceNumber: "desc" } })
    const invoice = nextInvoiceNumber(lastSale?.invoiceNumber)
    const openSession = await db.cashSession.findFirst({ where: { status: "abierta" } })
    if (acet && lora && openSession) {
      const items = [{ p: acet, q: 2 }, { p: lora, q: 1 }]
      const subtotal = items.reduce((s, it) => s + it.p.price * it.q, 0)
      const total = subtotal
      await db.sale.create({
        data: {
          invoiceNumber: invoice,
          subtotal,
          tax: 0,
          total,
          paymentMethod: "efectivo",
          amountReceived: total,
          change: 0,
          cashSessionId: openSession.id,
          items: {
            create: items.map((it) => ({
              productId: it.p.id,
              quantity: it.q,
              unitPrice: it.p.price,
              unitCost: it.p.cost,
              subtotal: it.p.price * it.q,
            })),
          },
        },
      })
      for (const it of items) {
        await db.product.update({ where: { id: it.p.id }, data: { stock: { decrement: it.q } } })
      }
      await db.cashTransaction.create({
        data: {
          cashSessionId: openSession.id,
          type: "venta",
          amount: total,
          concept: `Venta ${invoice}`,
          method: "efectivo",
        },
      })
    }

    // Usuarios del sistema (con PIN hasheado)
    await db.user.deleteMany()
    await db.user.createMany({
      data: [
        { name: "admin", role: "admin", pinHash: hashPin("1234") },
        { name: "vendedor", role: "vendedor", pinHash: hashPin("0000") },
      ],
    })

    const session = getSession(req)
    try {
      await logAudit({
        action: "seed",
        entityType: "system",
        userName: session?.name ?? "Sistema",
        role: session?.role ?? "admin",
        detail: "Datos de demostración cargados",
      })
    } catch {
      // noop: logging failure must not break the operation
    }

    return NextResponse.json({ ok: true, message: "Datos de demostración cargados correctamente. Usuarios: admin (PIN 1234), vendedor (PIN 0000)." })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
