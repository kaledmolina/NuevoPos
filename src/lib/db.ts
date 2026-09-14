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