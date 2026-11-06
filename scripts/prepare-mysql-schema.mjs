import fs from "fs"
import path from "path"

const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma")

if (!fs.existsSync(schemaPath)) {
  console.log("No se encontró schema.prisma")
  process.exit(0)
}

let content = fs.readFileSync(schemaPath, "utf-8")

// 1. Cambiar proveedor a MySQL
content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "mysql"')

// 2. Convertir campos de texto largo para MySQL (evitar VARCHAR(191) por defecto)
// En Prisma MySQL, String sin @db.Text se limita a VARCHAR(191), causando "Data too long"
const textReplacements = [
  // WhatsAppMessage
  { from: /\btext\s+String(?!\s+@db\.)/g, to: "text      String   @db.Text" },
  // WhatsAppConfig
  { from: /\baiSystemPrompt\s+String\?(?!\s+@db\.)/g, to: "aiSystemPrompt       String?  @db.Text" },
  { from: /\bwelcomeMessage\s+String\?(?!\s+@db\.)/g, to: "welcomeMessage       String?  @db.Text" },
  // WhatsAppTemplate
  { from: /\bbody\s+String(?!\s+@db\.)/g, to: "body      String   @db.Text" },
  { from: /\bvariables\s+String\?(?!\s+@db\.)/g, to: "variables String?  @db.Text" },
  // Order
  { from: /\bdeliveryNotes\s+String\?(?!\s+@db\.)/g, to: "deliveryNotes  String?  @db.Text" },
  { from: /\bnotes\s+String\?(?!\s+@db\.)/g, to: "notes          String?  @db.Text" },
  // Product
  { from: /\bdescription\s+String\?(?!\s+@db\.)/g, to: "description  String?  @db.Text" },
]

for (const { from, to } of textReplacements) {
  content = content.replace(from, to)
}

fs.writeFileSync(schemaPath, content, "utf-8")
console.log("✅ Schema de Prisma adaptado con éxito para MySQL (campos @db.Text configurados).")
