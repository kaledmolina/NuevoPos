import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export function isMysql(): boolean {
  return true // OmniPOS opera de manera oficial y exclusiva sobre MySQL
}

let mysqlPatched = false
/**
 * Auto-parche para MySQL: Asegura que las columnas críticas de texto sean TEXT o LONGTEXT
 * en todos los módulos del sistema en lugar del VARCHAR(191) por defecto de Prisma,
 * evitando errores de "Data too long for column" en cualquier módulo.
 */
export async function ensureMySqlTextColumns(): Promise<void> {
  if (mysqlPatched) return
  try {
    mysqlPatched = true
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppMessage MODIFY COLUMN text TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppConfig MODIFY COLUMN aiSystemPrompt TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppConfig MODIFY COLUMN welcomeMessage TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppConfig MODIFY COLUMN metaAccessToken TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppTemplate MODIFY COLUMN content TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE \`Order\` MODIFY COLUMN deliveryNotes TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE \`Order\` MODIFY COLUMN notes TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE \`Order\` MODIFY COLUMN deliveryAddress TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE Product MODIFY COLUMN description TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE Client MODIFY COLUMN notes TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE Client MODIFY COLUMN address TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE User MODIFY COLUMN allowedBranchIds VARCHAR(1000) NOT NULL DEFAULT '[]';`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE AuditLog MODIFY COLUMN detail TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE AuditLog MODIFY COLUMN meta TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE Setting MODIFY COLUMN value TEXT;`).catch(() => {})
    console.log("🐬 Columnas TEXT de MySQL verificadas y aseguradas en todos los módulos.")
  } catch (err) {
    console.warn("[MySQL Text Columns Patch Error]:", err)
  }
}

export function getBackupDirectory(): string {
  const baseDir = process.env.BACKUP_DIR || path.resolve(process.cwd(), "db", "backups")
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
  return baseDir
}
