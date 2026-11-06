import { NextRequest } from "next/server"
import { apiSuccess } from "@/lib/api-response"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000"
  const proto = req.headers.get("x-forwarded-proto") || "http"
  const baseUrl = `${proto}://${host}/api/v1`

  return apiSuccess({
    name: "OmniPOS Core & Marketplace API",
    version: "1.0.0",
    status: "online",
    timestamp: new Date().toISOString(),
    baseUrl,
    documentationUrl: `${proto}://${host}/docs`,
    openApiSpecUrl: `${proto}://${host}/api/v1/openapi.json`,
    supportedRoles: [
      { role: "cliente", description: "Consumidor final. Puede explorar negocios, ver catálogo y hacer pedidos." },
      { role: "domiciliario", description: "Repartidor. Puede ver pedidos disponibles, auto-asignarse y marcar entregas." },
      { role: "vendedor", description: "Fuerza de venta / Preventista móvil. Consulta stock y registra ventas o pedidos en campo." },
      { role: "admin", description: "Administrador del comercio / negocio. Control de sedes, productos, ventas y pedidos." },
      { role: "superadmin", description: "Superadministrador de la plataforma SaaS OmniPOS." },
    ],
    modules: [
      { name: "Autenticación", path: "/auth", description: "Login universal, auto-registro de clientes y perfil de usuario." },
      { name: "Negocios (Comercios)", path: "/businesses", description: "Directorio de negocios registrados, sedes y categorías." },
      { name: "Productos & Catálogo", path: "/products", description: "Catálogo multisede, precios, inventario y búsqueda." },
      { name: "Pedidos (Orders)", path: "/orders", description: "Creación de pedidos por clientes/vendedores, tracking y estados." },
      { name: "Domicilios (Delivery)", path: "/delivery", description: "Gestión de pedidos para la app de repartidores y entregas." },
      { name: "Ventas (POS)", path: "/sales", description: "Registro directo de ventas y facturación en caja." },
      { name: "Categorías", path: "/categories", description: "Clasificación de productos del sistema." },
    ],
  })
}
