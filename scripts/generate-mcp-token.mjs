#!/usr/bin/env node

/**
 * OmniPOS - Generador de Tokens Criptográficos para Agentes MCP
 * 
 * Uso:
 *   node scripts/generate-mcp-token.mjs --role vendedor --branch sede_norte --name "Bot Mostrador Norte"
 *   node scripts/generate-mcp-token.mjs --role cliente --client cl_12345 --name "Cliente WhatsApp"
 *   node scripts/generate-mcp-token.mjs --role admin --branch sede_principal --name "Agente Gerencia"
 */

import crypto from "crypto"

const FALLBACK_SECRET = "drogueria-pos-dev-fallback-secret"
const SECRET = process.env.AUTH_SECRET || FALLBACK_SECRET

// Analizar argumentos CLI
const args = process.argv.slice(2)
function getArg(flag, defaultValue = null) {
  const index = args.indexOf(flag)
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1]
  }
  return defaultValue
}

const role = getArg("--role", "admin")
const branchId = getArg("--branch", "sede_principal")
const name = getArg("--name", "Agente OmniPOS")
const tenantId = getArg("--tenant", "tenant_demo")
const clientId = getArg("--client", null)

const VALID_ROLES = ["superadmin", "admin", "vendedor", "domiciliario", "cliente"]
if (!VALID_ROLES.includes(role)) {
  console.error(`❌ Rol inválido: "${role}". Roles permitidos: ${VALID_ROLES.join(", ")}`)
  process.exit(1)
}

const payload = {
  uid: `agent_${crypto.randomBytes(4).toString("hex")}`,
  name,
  role,
  tenantId,
  branchId,
  clientId,
  iat: Date.now(),
}

// Firmar con HMAC-SHA256
const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
const signature = crypto.createHmac("sha256", SECRET).update(data).digest("base64url")
const token = `${data}.${signature}`

console.log("\n===========================================================")
console.log(" 🔐 OMNIPOS - TOKEN CRIPTOGRÁFICO DE AGENTE MCP GENERADO")
console.log("===========================================================\n")
console.log("📋 Metadatos del Token:")
console.log("   • Nombre Agente :", name)
console.log("   • Rol Asignado  :", role)
console.log("   • Sede Asignada :", branchId)
console.log("   • Tenant        :", tenantId)
if (clientId) console.log("   • Cliente ID    :", clientId)
console.log("   • Generado      :", new Date().toLocaleString())
console.log("\n🔑 Token Criptográfico (Inalterable):")
console.log(token)

console.log("\n📝 Configuración recomendada para claude_desktop_config.json:")
console.log(JSON.stringify({
  mcpServers: {
    omnipos: {
      command: "node",
      args: ["C:/Users/Mi Pc/Desktop/hositnge/NuevoPos/scripts/mcp-server.mjs"],
      env: {
        OMNIPOS_AUTH_TOKEN: token
      }
    }
  }
}, null, 2))

console.log("\n🛡️  GARANTÍA DE SEGURIDAD:")
console.log("Si alguien intenta alterar 'role' a 'admin' o cambiar la sede manualmente,")
console.log("la firma HMAC-SHA256 no coincidirá con el AUTH_SECRET del servidor,")
console.log("y la conexión del agente será bloqueada inmediatamente.\n")
