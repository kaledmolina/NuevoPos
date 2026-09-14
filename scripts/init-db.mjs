import { db } from "../src/lib/db"

async function main() {
  console.log("➡️ Sincronizando modelos con MySQL...")
  // Conectar y verificar
  await db.$connect()
  console.log("✅ Conexión con MySQL exitosa.")
}

main()
  .catch((e) => {
    console.error("❌ Error en init-db:", e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
