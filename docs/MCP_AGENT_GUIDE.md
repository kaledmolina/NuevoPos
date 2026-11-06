# 🤖 Guía Oficial: Servidor MCP (Model Context Protocol) & Arquitectura OmniPOS

Este documento explica cómo conectar agentes de Inteligencia Artificial (Claude Desktop, Cursor, Antigravity, ChatGPT/Open-WebUI o bots de WhatsApp) con **OmniPOS**, y confirma la paridad total de los endpoints del sistema.

---

## 1. ¿Los endpoints hacen todo lo que la web hace?

**SÍ, 100% de paridad funcional.**

La arquitectura de OmniPOS está desacoplada:
* La interfaz visual (Next.js, React, Tailwind CSS, Shadcn UI) es un **cliente consumidor**.
* Cada acción que ocurre en pantalla (hacer clic en cobrar, asignar un conductor, abrir caja, ajustar inventario, crear cliente) se ejecuta llamando a las rutas REST bajo:
  * `/api/...` (operaciones de sesión de usuario, usuarios, productos, reportes, caja).
  * `/api/v1/...` (API pública y externa para integraciones de preventa, marketplace, domicilios y órdenes).

Esto significa que:
1. **Cualquier aplicación móvil externa** (React Native, Flutter, Swift, Kotlin) puede consumir la misma API.
2. **Cualquier agente de IA o bot de mensajería** puede ejecutar las mismas operaciones de forma desatendida.
3. Para el despliegue en servidor robusto, puedes empaquetarlo en Docker o Node.js y los endpoints responderán a cualquier cliente autorizado con Token/PIN/API Key.

---

## 2. Servidor MCP de OmniPOS (`omnipos-mcp`)

Hemos construido un **Servidor MCP nativo** en [scripts/mcp-server.mjs](file:///c:/Users/Mi%20Pc/Desktop/hositnge/NuevoPos/scripts/mcp-server.mjs) que implementa el protocolo oficial **Model Context Protocol (JSON-RPC 2.0)** sobre `stdio`.

### Catálogo de Herramientas (11 Tools integradas)

| Herramienta | Descripción |
| :--- | :--- |
| `pos_get_business_summary` | Resumen ejecutivo en tiempo real: ventas del día, balance de caja, pedidos pendientes y alertas de inventario crítico. |
| `pos_search_products` | Búsqueda inteligente por nombre o código de barras con precios, costo, stock y fecha de vencimiento. |
| `pos_create_or_update_product` | Creación de nuevos productos o ajuste de existencias y precios en catálogo. |
| `pos_get_sales_history` | Historial de facturas emitidas con desglose de ítems, clientes y métodos de pago. |
| `pos_get_cash_status` | Estado de arqueo de caja registradora, cajero responsable, base inicial y ventas en efectivo. |
| `pos_record_cash_movement` | Registro de ingresos y egresos menores (gastos de flete, compras menores, retiros de dinero). |
| `pos_list_orders` | Listado de pedidos a domicilio filtrable por estado (`pendiente`, `en_camino`, `entregado`, etc.). |
| `pos_assign_order_driver` | Asignación de conductor/domiciliario a un pedido y despacho automático en ruta. |
| `pos_get_client_credit` | Consulta de cartera, cupo disponible y deuda acumulada de un cliente. |
| `pos_record_credit_payment` | Registro de abonos a cuentas de crédito con actualización inmediata de saldo. |
| `pos_get_financial_reports` | Cálculo de utilidad bruta, costo de mercancía, gastos operativos, margen neto y rentabilidad. |

---

## 3. Cómo conectar tu Agente de IA al MCP

### A. En Claude Desktop
Edita el archivo de configuración de Claude Desktop:
* En Windows: `%APPDATA%\Claude\claude_desktop_config.json`
* En Mac/Linux: `~/Library/Application Support/Claude/claude_desktop_config.json`

Agrega el bloque del servidor OmniPOS:
```json
{
  "mcpServers": {
    "omnipos": {
      "command": "node",
      "args": [
        "C:\\Users\\Mi Pc\\Desktop\\hositnge\\NuevoPos\\scripts\\mcp-server.mjs"
      ],
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

### B. En Cursor / Antigravity IDE
En la sección **Cursor Settings > Features > MCP**:
* **Name:** `omnipos`
* **Type:** `command`
* **Command:** `node "c:\Users\Mi Pc\Desktop\hositnge\NuevoPos\scripts\mcp-server.mjs"`

### C. Prueba rápida en consola
Puedes probar la respuesta del servidor en cualquier momento ejecutando:
```bash
npm run mcp
# o ejecutando el validador automático:
node scripts/test-mcp.mjs
```

---

## 4. Ejemplos de lo que puedes pedirle al Agente

Una vez conectado, podrás abrir el chat con tu agente y decirle de forma natural:

1. *"¿Cuánto vendimos hoy y cuánta plata debe haber en la gaveta en efectivo?"*
   * *El agente ejecuta `pos_get_business_summary` y `pos_get_cash_status` y te responde con el arqueo exacto.*
2. *"Asigna el pedido PED-20261105-1001 al repartidor Andrés Repartidor y ponlo en camino."*
   * *El agente ejecuta `pos_assign_order_driver` con `dispatchNow: true`.*
3. *"El cliente Carlos Gómez vino a abonar $50.000 a su cuenta de crédito, regístralo."*
   * *El agente ejecuta `pos_record_credit_payment` y te indica el nuevo saldo pendiente.*
4. *"¿Cuáles productos tienen menos de 5 unidades de stock para pedir al proveedor?"*
   * *El agente consulta el catálogo y te genera la lista de compras.*
5. *"Dame el reporte financiero de los últimos 30 días con utilidad neta y margen."*
   * *El agente ejecuta `pos_get_financial_reports` calculando ingresos vs costos y gastos.*

---

## 5. Recomendaciones para el despliegue en un Servidor Robusto

Cuando vayas a pasar este proyecto a producción (VPS Ubuntu, AWS, Railway, DigitalOcean):

1. **Base de Datos Robusta:**
   * Migrar de SQLite (`db/custom.db`) a **PostgreSQL** o **MySQL**.
   * Solo debes cambiar `provider = "postgresql"` en `prisma/schema.prisma` y definir la variable `DATABASE_URL="postgresql://user:pass@host:5432/posdb"`.
   * Ejecutas `npx prisma migrate deploy`.

2. **Despliegue de la Web (Next.js):**
   * Usar el modo standalone ya configurado en Next.js con PM2 o Docker:
     ```bash
     pm2 start npm --name "omnipos-web" -- start
     ```
   * O correr con Docker Compose (Next.js + Postgres + Nginx SSL con Let's Encrypt).

3. **Acceso Remoto al MCP para tu Agente:**
   * Si el agente corre en tu PC local y el servidor POS está en la nube, puedes conectar el MCP vía:
     * **Túnel SSH stdio** (`ssh user@tuservidor.com "node /var/www/pos/scripts/mcp-server.mjs"`).
     * O envolver el script en transporte HTTP / SSE (Server-Sent Events) protegido por Bearer Token.
