import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

import path from 'path'
import fs from 'fs'

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export function isMysql(): boolean {
  const url = process.env.DATABASE_URL || ""
  return url.startsWith("mysql:") || url.startsWith("mysql2:")
}

let mysqlPatched = false
/**
 * Auto-parche para MySQL: Asegura que las columnas críticas de texto sean TEXT o LONGTEXT
 * en lugar del VARCHAR(191) por defecto de Prisma, evitando errores de "Data too long".
 */
export async function ensureMySqlTextColumns(): Promise<void> {
  if (mysqlPatched || !isMysql()) return
  try {
    mysqlPatched = true
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppMessage MODIFY COLUMN text TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppConfig MODIFY COLUMN aiSystemPrompt TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppConfig MODIFY COLUMN welcomeMessage TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE WhatsAppTemplate MODIFY COLUMN body TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE Order MODIFY COLUMN deliveryNotes TEXT;`).catch(() => {})
    await db.$executeRawUnsafe(`ALTER TABLE Order MODIFY COLUMN notes TEXT;`).catch(() => {})
    console.log("🐬 Columnas TEXT de MySQL verificadas y aseguradas.")
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

export function getDatabasePath(): string {
  const url = process.env.DATABASE_URL || "file:../db/custom.db"
  if (isMysql()) {
    return path.resolve(process.cwd(), "db", "custom.db")
  }
  const clean = url.replace(/^file:/, "")
  if (path.isAbsolute(clean)) return clean
  if (clean.startsWith("../")) {
    return path.resolve(process.cwd(), clean.slice(3))
  }
  return path.resolve(process.cwd(), clean)
}