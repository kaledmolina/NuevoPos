import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { nextInvoiceNumber } from "@/lib/format"
import { requireAdmin, hashPin, getSession, logAudit } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json().catch(() => ({}))
    const type = String(body.type || body.rubro || "drogueria").toLowerCase()

    // Limpiar datos existentes respetando integridad referencial
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
    await db.setting.deleteMany()

    const now = new Date()
    const day = 24 * 60 * 60 * 1000
    const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * day)

    let storeSettings: { key: string; value: string }[] = []
    let catNames: string[] = []
    let products: {
      name: string
      cat: string
      cost: number
      price: number
      stock: number
      min: number
      exp: number | null
      barcode: string
      unit: string
      location?: string
    }[] = []
    let clientsData: { name: string; document: string | null; phone: string | null; isGeneric?: boolean }[] = []
    let suppliersData: { name: string; document: string; phone: string; contactName: string }[] = []

    if (type === "tienda" || type === "minimarket" || type === "abarrotes") {
      storeSettings = [
        { key: "store_name", value: "Minimarket & Tienda El Buen Vecino" },
        { key: "store_rubro", value: "tienda" },
        { key: "store_nit", value: "901.452.789-3" },
        { key: "store_phone", value: "+57 312 456 7890" },
        { key: "store_address", value: "Carrera 15 # 45-20, Barrio Central" },
        { key: "store_email", value: "contacto@elbuenvecino.com" },
        { key: "currency", value: "COP" },
        { key: "currency_symbol", value: "$" },
        { key: "tax_rate", value: "0" },
        { key: "tax_name", value: "IVA" },
        { key: "enable_expiration", value: "true" },
        { key: "receipt_message", value: "¡Gracias por preferirnos! Vecino siempre a tu servicio." },
      ]

      catNames = [
        "Abarrotes y Granos",
        "Lácteos y Huevos",
        "Bebidas y Refrescos",
        "Snacks y Golosinas",
        "Aseo y Limpieza",
        "Cuidado Personal",
        "Panadería y Dulces",
        "Enlatados y Conservas",
      ]

      products = [
        { name: "Arroz Diana Premium 1kg", cat: "Abarrotes y Granos", cost: 3400, price: 4500, stock: 120, min: 25, exp: 360, barcode: "7701001001", unit: "bolsa", location: "Pasillo 1" },
        { name: "Aceite Premier 1000ml", cat: "Abarrotes y Granos", cost: 8500, price: 11500, stock: 45, min: 15, exp: 240, barcode: "7701001002", unit: "botella", location: "Pasillo 1" },
        { name: "Azúcar Incauca 1kg", cat: "Abarrotes y Granos", cost: 3800, price: 4900, stock: 80, min: 20, exp: 500, barcode: "7701001003", unit: "bolsa", location: "Pasillo 1" },
        { name: "Frijol Bola Roja 500g", cat: "Abarrotes y Granos", cost: 4200, price: 5800, stock: 60, min: 15, exp: 300, barcode: "7701001004", unit: "bolsa", location: "Pasillo 1" },
        { name: "Café Sello Rojo 500g", cat: "Abarrotes y Granos", cost: 13500, price: 17900, stock: 35, min: 10, exp: 180, barcode: "7701001005", unit: "paquete", location: "Pasillo 1" },
        { name: "Leche Entera Colanta 1L", cat: "Lácteos y Huevos", cost: 3600, price: 4700, stock: 90, min: 20, exp: 25, barcode: "7701001006", unit: "bolsa", location: "Nevera 1" },
        { name: "Huevos Tipo AA x 30", cat: "Lácteos y Huevos", cost: 14500, price: 18500, stock: 40, min: 10, exp: 20, barcode: "7701001007", unit: "panal", location: "Mostrador" },
        { name: "Queso Costeño 500g", cat: "Lácteos y Huevos", cost: 9500, price: 13500, stock: 25, min: 8, exp: 15, barcode: "7701001008", unit: "bloque", location: "Nevera 1" },
        { name: "Mantequilla Rama 250g", cat: "Lácteos y Huevos", cost: 4200, price: 5900, stock: 30, min: 10, exp: 90, barcode: "7701001009", unit: "pote", location: "Nevera 1" },
        { name: "Coca-Cola 1.5L No Retornable", cat: "Bebidas y Refrescos", cost: 4300, price: 5800, stock: 75, min: 20, exp: 120, barcode: "7701001010", unit: "botella", location: "Nevera 2" },
        { name: "Agua Cristal 600ml", cat: "Bebidas y Refrescos", cost: 1200, price: 2000, stock: 150, min: 30, exp: 365, barcode: "7701001011", unit: "botella", location: "Nevera 2" },
        { name: "Jugo Hit Mora 500ml", cat: "Bebidas y Refrescos", cost: 2100, price: 3000, stock: 60, min: 15, exp: 45, barcode: "7701001012", unit: "botella", location: "Nevera 2" },
        { name: "Papas Margarita Pollo 110g", cat: "Snacks y Golosinas", cost: 3100, price: 4200, stock: 50, min: 15, exp: 60, barcode: "7701001013", unit: "paquete", location: "Estante Snacks" },
        { name: "Galletas Festival Chocolate x 12", cat: "Snacks y Golosinas", cost: 4800, price: 6500, stock: 45, min: 12, exp: 150, barcode: "7701001014", unit: "paquete", location: "Estante Snacks" },
        { name: "Chocolatina Jet 12g x 24", cat: "Snacks y Golosinas", cost: 14000, price: 19200, stock: 20, min: 6, exp: 200, barcode: "7701001015", unit: "caja", location: "Mostrador" },
        { name: "Jabón Rey Barra 300g", cat: "Aseo y Limpieza", cost: 2400, price: 3500, stock: 85, min: 20, exp: null, barcode: "7701001016", unit: "unidad", location: "Pasillo 3" },
        { name: "Detergente Fab 1kg", cat: "Aseo y Limpieza", cost: 7200, price: 9800, stock: 40, min: 12, exp: null, barcode: "7701001017", unit: "bolsa", location: "Pasillo 3" },
        { name: "Cloro Blanqueador 1L", cat: "Aseo y Limpieza", cost: 2800, price: 4200, stock: 35, min: 10, exp: null, barcode: "7701001018", unit: "botella", location: "Pasillo 3" },
        { name: "Atún Van Camp's en Aceite 160g", cat: "Enlatados y Conservas", cost: 4800, price: 6800, stock: 65, min: 15, exp: 400, barcode: "7701001019", unit: "lata", location: "Pasillo 2" },
        { name: "Pan Tajado Bimbo Grande 550g", cat: "Panadería y Dulces", cost: 6200, price: 8500, stock: 18, min: 8, exp: 12, barcode: "7701001020", unit: "paquete", location: "Mostrador" },
      ]

      clientsData = [
        { name: "Doña Carmen (Vecina 201)", document: "41987654", phone: "3154441122" },
        { name: "Don Pedro (Taller)", document: "79876543", phone: "3165552233" },
        { name: "Laura Restrepo", document: "1020304050", phone: "3176663344" },
        { name: "Andrés Molina", document: "1030405060", phone: "3187774455" },
        { name: "Cliente Genérico", document: null, phone: null, isGeneric: true },
      ]

      suppliersData = [
        [
          { name: "Distribuidora Mayorista La Sabana", document: "900.222.333-1", phone: "6017770011", contactName: "Mauricio Silva" },
          { name: "Colanta Cooperativa", document: "890.900.123-4", phone: "6048880022", contactName: "Marcela Ríos" },
          { name: "Postobón & Bebidas S.A.", document: "860.000.555-8", phone: "6019990033", contactName: "Guillermo Pardo" },
          { name: "Nutresa Alimentos", document: "890.900.050-1", phone: "6044440044", contactName: "Diana Morales" },
        ],
      ][0]
    } else if (type === "ferreteria" || type === "materiales") {
      storeSettings = [
        { key: "store_name", value: "Ferretería & Construcción La Central" },
        { key: "store_rubro", value: "ferreteria" },
        { key: "store_nit", value: "900.654.321-8" },
        { key: "store_phone", value: "+57 311 888 9900" },
        { key: "store_address", value: "Avenida Industrial # 68-12, Bodega 4" },
        { key: "store_email", value: "ventas@ferreterialacentral.com" },
        { key: "currency", value: "COP" },
        { key: "currency_symbol", value: "$" },
        { key: "tax_rate", value: "19" },
        { key: "tax_name", value: "IVA" },
        { key: "enable_expiration", value: "false" },
        { key: "receipt_message", value: "¡Gracias por su compra! Materiales garantizados para su obra." },
      ]

      catNames = [
        "Herramientas Manuales",
        "Herramientas Eléctricas",
        "Tornillería y Fijaciones",
        "Plomería y Tuberías",
        "Electricidad e Iluminación",
        "Pinturas y Acabados",
        "Materiales de Construcción",
        "Seguridad Industrial",
      ]

      products = [
        { name: "Martillo de Uña 16oz Stanley", cat: "Herramientas Manuales", cost: 22000, price: 34500, stock: 24, min: 6, exp: null, barcode: "7703001001", unit: "unidad", location: "Estante H1" },
        { name: "Flexómetro 5 Metros Pro", cat: "Herramientas Manuales", cost: 11000, price: 17900, stock: 40, min: 10, exp: null, barcode: "7703001002", unit: "unidad", location: "Estante H1" },
        { name: "Alicate Universal 8 pulgada", cat: "Herramientas Manuales", cost: 16500, price: 26000, stock: 18, min: 5, exp: null, barcode: "7703001003", unit: "unidad", location: "Estante H1" },
        { name: "Juego de Destornilladores x 6", cat: "Herramientas Manuales", cost: 24000, price: 38000, stock: 15, min: 4, exp: null, barcode: "7703001004", unit: "juego", location: "Estante H2" },
        { name: "Taladro Percutor 650W DeWalt", cat: "Herramientas Eléctricas", cost: 210000, price: 295000, stock: 8, min: 2, exp: null, barcode: "7703001005", unit: "unidad", location: "Vitrina 1" },
        { name: "Pulidora Angular 4-1/2 850W", cat: "Herramientas Eléctricas", cost: 165000, price: 235000, stock: 6, min: 2, exp: null, barcode: "7703001006", unit: "unidad", location: "Vitrina 1" },
        { name: "Tornillo Drywall 6x1 x 100", cat: "Tornillería y Fijaciones", cost: 4500, price: 7900, stock: 85, min: 20, exp: null, barcode: "7703001007", unit: "caja", location: "Cajón T3" },
        { name: "Chazo Plástico 5/16 x 50", cat: "Tornillería y Fijaciones", cost: 3200, price: 5500, stock: 90, min: 20, exp: null, barcode: "7703001008", unit: "paquete", location: "Cajón T4" },
        { name: "Tubo PVC Sanitario 3 pulgada x 3m", cat: "Plomería y Tuberías", cost: 28000, price: 42000, stock: 30, min: 8, exp: null, barcode: "7703001009", unit: "tubo", location: "Patio P1" },
        { name: "Codo PVC Presión 1/2 90°", cat: "Plomería y Tuberías", cost: 900, price: 1800, stock: 140, min: 30, exp: null, barcode: "7703001010", unit: "unidad", location: "Cajón P1" },
        { name: "Cinta Teflón 3/4 x 10m", cat: "Plomería y Tuberías", cost: 1200, price: 2500, stock: 110, min: 25, exp: null, barcode: "7703001011", unit: "rollo", location: "Estante P2" },
        { name: "Cinta Aislante 3M Negra", cat: "Electricidad e Iluminación", cost: 2800, price: 4900, stock: 75, min: 20, exp: null, barcode: "7703001012", unit: "rollo", location: "Estante E1" },
        { name: "Bombillo LED 12W Luz Blanca", cat: "Electricidad e Iluminación", cost: 4200, price: 7500, stock: 65, min: 15, exp: null, barcode: "7703001013", unit: "unidad", location: "Estante E2" },
        { name: "Cable Dúplex #14 x Metro", cat: "Electricidad e Iluminación", cost: 1800, price: 3000, stock: 250, min: 50, exp: null, barcode: "7703001014", unit: "metro", location: "Carrete 1" },
        { name: "Pintura Vinilo Tipo 1 Blanco Galón", cat: "Pinturas y Acabados", cost: 38000, price: 56000, stock: 22, min: 5, exp: null, barcode: "7703001015", unit: "galón", location: "Estante Pinturas" },
        { name: "Brocha Monamur 3 pulgada", cat: "Pinturas y Acabados", cost: 5500, price: 9200, stock: 35, min: 10, exp: null, barcode: "7703001016", unit: "unidad", location: "Estante Pinturas" },
        { name: "Cemento Gris Argos 50kg", cat: "Materiales de Construcción", cost: 29000, price: 36000, stock: 50, min: 15, exp: null, barcode: "7703001017", unit: "bulto", location: "Bodega Principal" },
        { name: "Guantes de Vaqueta Tipo Ingeniero", cat: "Seguridad Industrial", cost: 8500, price: 14000, stock: 45, min: 10, exp: null, barcode: "7703001018", unit: "par", location: "Estante Seguridad" },
      ]

      clientsData = [
        { name: "Constructora Horizonte S.A.S", document: "901.123.999-5", phone: "3148881122" },
        { name: "Maestro Juan Pérez", document: "19876543", phone: "3127773344" },
        { name: "Ing. Roberto Gómez", document: "79456123", phone: "3106665544" },
        { name: "Instalaciones Eléctricas Ruiz", document: "900.555.444-2", phone: "3164448899" },
        { name: "Cliente Genérico", document: null, phone: null, isGeneric: true },
      ]

      suppliersData = [
        { name: "Distribuciones Ferreteras Nacionales", document: "860.111.999-4", phone: "6014445566", contactName: "Alonso Vargas" },
        { name: "Argos Colombia S.A.", document: "890.900.266-3", phone: "6045551122", contactName: "Felipe Osorio" },
        { name: "Stanley Black & Decker Colombia", document: "830.000.777-1", phone: "6013339988", contactName: "Natalia Castro" },
        { name: "Pavco Wavin Colombia", document: "860.005.188-9", phone: "6017772211", contactName: "Javier Mendoza" },
      ]
    } else if (type === "ropa" || type === "boutique" || type === "calzado") {
      storeSettings = [
        { key: "store_name", value: "Moda & Estilo Boutique" },
        { key: "store_rubro", value: "ropa" },
        { key: "store_nit", value: "901.789.456-2" },
        { key: "store_phone", value: "+57 320 999 1122" },
        { key: "store_address", value: "Centro Comercial Plaza Mayor, Local 215" },
        { key: "store_email", value: "contacto@modayestilo.com" },
        { key: "currency", value: "COP" },
        { key: "currency_symbol", value: "$" },
        { key: "tax_rate", value: "19" },
        { key: "tax_name", value: "IVA" },
        { key: "enable_expiration", value: "false" },
        { key: "receipt_message", value: "¡Gracias por tu compra! Prendas con 30 días para cambio con etiqueta." },
      ]

      catNames = [
        "Camisetas y Tops",
        "Jeans y Pantalones",
        "Vestidos y Faldas",
        "Chaquetas y Abrigos",
        "Calzado",
        "Ropa Interior y Pijamas",
        "Accesorios y Bolsos",
      ]

      products = [
        { name: "Camiseta Básica Algodón Talla M Blanco", cat: "Camisetas y Tops", cost: 18000, price: 38000, stock: 35, min: 8, exp: null, barcode: "7704001001", unit: "unidad", location: "Perchero A1" },
        { name: "Camiseta Básica Algodón Talla L Negro", cat: "Camisetas y Tops", cost: 18000, price: 38000, stock: 28, min: 8, exp: null, barcode: "7704001002", unit: "unidad", location: "Perchero A1" },
        { name: "Blusa Elegante Seda Talla S", cat: "Camisetas y Tops", cost: 32000, price: 69000, stock: 15, min: 4, exp: null, barcode: "7704001003", unit: "unidad", location: "Perchero A2" },
        { name: "Jean Slim Fit Azul Talla 30", cat: "Jeans y Pantalones", cost: 45000, price: 95000, stock: 20, min: 5, exp: null, barcode: "7704001004", unit: "unidad", location: "Estante Jeans" },
        { name: "Jean Slim Fit Azul Talla 32", cat: "Jeans y Pantalones", cost: 45000, price: 95000, stock: 22, min: 5, exp: null, barcode: "7704001005", unit: "unidad", location: "Estante Jeans" },
        { name: "Pantalón Chino Beige Talla 32", cat: "Jeans y Pantalones", cost: 42000, price: 89000, stock: 14, min: 4, exp: null, barcode: "7704001006", unit: "unidad", location: "Estante Jeans" },
        { name: "Vestido Casual Floral Talla M", cat: "Vestidos y Faldas", cost: 48000, price: 110000, stock: 12, min: 3, exp: null, barcode: "7704001007", unit: "unidad", location: "Perchero B1" },
        { name: "Chaqueta Denim Clásica Talla M", cat: "Chaquetas y Abrigos", cost: 65000, price: 145000, stock: 10, min: 3, exp: null, barcode: "7704001008", unit: "unidad", location: "Perchero C1" },
        { name: "Zapatillas Urbanas Blancas #38", cat: "Calzado", cost: 75000, price: 165000, stock: 8, min: 2, exp: null, barcode: "7704001009", unit: "par", location: "Zapatero Z1" },
        { name: "Zapatillas Urbanas Blancas #40", cat: "Calzado", cost: 75000, price: 165000, stock: 10, min: 2, exp: null, barcode: "7704001010", unit: "par", location: "Zapatero Z1" },
        { name: "Cinturón Cuero Genuino Café", cat: "Accesorios y Bolsos", cost: 22000, price: 49000, stock: 25, min: 5, exp: null, barcode: "7704001011", unit: "unidad", location: "Vitrina Accesorios" },
        { name: "Bolso Tote Bag Cuero Sintético", cat: "Accesorios y Bolsos", cost: 38000, price: 85000, stock: 12, min: 3, exp: null, barcode: "7704001012", unit: "unidad", location: "Vitrina Bolsos" },
      ]

      clientsData = [
        { name: "Valentina Morales", document: "1019283746", phone: "3185551100" },
        { name: "Camila Herrera", document: "1028374655", phone: "3174442299" },
        { name: "Santiago Duque", document: "1037465829", phone: "3163333388" },
        { name: "Cliente Genérico", document: null, phone: null, isGeneric: true },
      ]

      suppliersData = [
        { name: "Confecciones Andinas S.A.S", document: "900.555.888-1", phone: "6042223344", contactName: "Gloria Arango" },
        { name: "Textiles del Valle", document: "890.333.222-7", phone: "6025556677", contactName: "Esteban Londoño" },
        { name: "Calzado Colombiano Export", document: "901.000.444-9", phone: "6076667788", contactName: "Juliana Peñaranda" },
      ]
    } else {
      // DEFAULT: Droguería & Farmacia
      storeSettings = [
        { key: "store_name", value: "Droguería & Farmacia La Salud" },
        { key: "store_rubro", value: "drogueria" },
        { key: "store_nit", value: "900.123.456-7" },
        { key: "store_phone", value: "+57 310 555 0100" },
        { key: "store_address", value: "Calle 45 # 23-18, Bogotá" },
        { key: "store_email", value: "contacto@droguerialasalud.com" },
        { key: "currency", value: "COP" },
        { key: "currency_symbol", value: "$" },
        { key: "tax_rate", value: "0" },
        { key: "tax_name", value: "IVA" },
        { key: "enable_expiration", value: "true" },
        { key: "receipt_message", value: "¡Gracias por su compra! Cuide su salud y bienestar." },
      ]

      catNames = [
        "Analgésicos",
        "Antibióticos",
        "Antialérgicos",
        "Gastrointestinal",
        "Vitaminas",
        "Cuidado Personal",
        "Primeros Auxilios",
        "Bebés y Maternidad",
      ]

      products = [
        { name: "Acetaminofén 500mg x 10", cat: "Analgésicos", cost: 1200, price: 2800, stock: 240, min: 40, exp: 200, barcode: "7702001000011", unit: "caja", location: "E1" },
        { name: "Ibuprofeno 400mg x 10", cat: "Analgésicos", cost: 1800, price: 4200, stock: 12, min: 30, exp: 18, barcode: "7702001000028", unit: "caja", location: "E1" },
        { name: "Naproxeno 250mg x 14", cat: "Analgésicos", cost: 3200, price: 6800, stock: 60, min: 20, exp: 90, barcode: "7702001000035", unit: "caja", location: "E1" },
        { name: "Dolex 500mg x 10", cat: "Analgésicos", cost: 2400, price: 5900, stock: 8, min: 25, exp: -3, barcode: "7702001000042", unit: "caja", location: "E1" },
        { name: "Amoxicilina 500mg x 12", cat: "Antibióticos", cost: 4500, price: 9800, stock: 35, min: 15, exp: 25, barcode: "7702001000059", unit: "caja", location: "E2" },
        { name: "Azitromicina 500mg x 3", cat: "Antibióticos", cost: 8200, price: 16500, stock: 20, min: 10, exp: 120, barcode: "7702001000066", unit: "caja", location: "E2" },
        { name: "Loratadina 10mg x 10", cat: "Antialérgicos", cost: 2200, price: 5400, stock: 80, min: 20, exp: 300, barcode: "7702001000080", unit: "caja", location: "E3" },
        { name: "Omeprazol 20mg x 14", cat: "Gastrointestinal", cost: 3400, price: 7900, stock: 90, min: 25, exp: 150, barcode: "77020010103", unit: "caja", location: "E3" },
        { name: "Complejo B x 30", cat: "Vitaminas", cost: 5200, price: 12500, stock: 55, min: 15, exp: 365, barcode: "7702001000134", unit: "frasco", location: "E4" },
        { name: "Vitamina C 1g x 10 efervescente", cat: "Vitaminas", cost: 3600, price: 8400, stock: 70, min: 20, exp: 45, barcode: "7702001000141", unit: "tubo", location: "E4" },
        { name: "Alcohol antiséptico 750ml", cat: "Primeros Auxilios", cost: 4500, price: 9900, stock: 100, min: 20, exp: null, barcode: "7702001000165", unit: "botella", location: "E5" },
        { name: "Gasas estériles x 10", cat: "Primeros Auxilios", cost: 800, price: 2200, stock: 200, min: 30, exp: null, barcode: "7702001000172", unit: "paquete", location: "E5" },
        { name: "Curitas x 50", cat: "Primeros Auxilios", cost: 2600, price: 6100, stock: 3, min: 15, exp: null, barcode: "7702001000196", unit: "caja", location: "E5" },
        { name: "Jabón antibacterial 200g", cat: "Cuidado Personal", cost: 3200, price: 7200, stock: 65, min: 20, exp: 540, barcode: "7702001000202", unit: "unidad", location: "E6" },
        { name: "Pañales bebé talla M x 30", cat: "Bebés y Maternidad", cost: 21000, price: 35900, stock: 18, min: 8, exp: null, barcode: "7702001000240", unit: "paquete", location: "E7" },
      ]

      clientsData = [
        { name: "María González", document: "1029384756", phone: "3105550111" },
        { name: "Carlos Restrepo", document: "1038475629", phone: "3115550222" },
        { name: "Ana Martínez", document: "1047563829", phone: "3125550333" },
        { name: "Farmacia La Esperanza", document: "900.456.789-1", phone: "3145550555" },
        { name: "Cliente Genérico", document: null, phone: null, isGeneric: true },
      ]

      suppliersData = [
        { name: "Distribuciones Farma S.A.S", document: "900.111.222-3", phone: "6015550011", contactName: "Pedro Díaz" },
        { name: "Laboratorios Baxter Colombia", document: "830.222.333-4", phone: "6015550022", contactName: "Lucía Torres" },
        { name: "Cofarma", document: "860.333.444-5", phone: "6015550033", contactName: "Andrés Gómez" },
      ]
    }

    // Guardar configuraciones
    await db.setting.createMany({ data: storeSettings })

    // Categorías
    const cats = await Promise.all(catNames.map((name) => db.category.create({ data: { name } })))
    const catMap = Object.fromEntries(cats.map((c) => [c.name, c.id]))

    // Productos
    await db.product.createMany({
      data: products.map((p) => ({
        name: p.name,
        barcode: p.barcode,
        sku: p.barcode,
        categoryId: catMap[p.cat] || cats[0].id,
        cost: p.cost,
        price: p.price,
        stock: p.stock,
        minStock: p.min,
        unit: p.unit,
        expirationDate: p.exp === null ? null : d(p.exp),
        batch: p.exp !== null ? `L${Math.floor(Math.random() * 9000 + 1000)}` : null,
        location: p.location ?? "E1",
      })),
    })

    // Clientes
    await db.client.createMany({ data: clientsData })

    // Proveedores
    await db.supplier.createMany({ data: suppliersData })

    // Sesión de caja abierta
    const openSession = await db.cashSession.create({
      data: { openingAmount: 100000, status: "abierta", openedBy: "Administrador" },
    })

    // Venta de ejemplo
    const sampleProduct1 = await db.product.findFirst()
    const sampleProduct2 = await db.product.findFirst({ skip: 1 })
    const lastSale = await db.sale.findFirst({ orderBy: { invoiceNumber: "desc" } })
    const invoice = nextInvoiceNumber(lastSale?.invoiceNumber)

    if (sampleProduct1 && openSession) {
      const items = [{ p: sampleProduct1, q: 2 }]
      if (sampleProduct2) items.push({ p: sampleProduct2, q: 1 })

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
        detail: `Datos demo cargados para rubro: ${type.toUpperCase()}`,
        meta: { rubro: type },
      })
    } catch {
      /* noop */
    }

    const typeLabels: Record<string, string> = {
      tienda: "Tienda de Barrio / Minimarket",
      ferreteria: "Ferretería & Construcción",
      ropa: "Tienda de Ropa / Boutique",
      drogueria: "Droguería & Farmacia",
    }

    return NextResponse.json({
      ok: true,
      message: `Datos demo para "${typeLabels[type] ?? type}" cargados exitosamente.`,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
