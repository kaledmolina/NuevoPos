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

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

export function getDatabasePath(): string {
  const url = process.env.DATABASE_URL || "file:../db/custom.db"
  const clean = url.replace(/^file:/, "")
  if (path.isAbsolute(clean)) return clean
  if (clean.startsWith("../")) {
    return path.resolve(process.cwd(), clean.slice(3))
  }
  return path.resolve(process.cwd(), clean)
}