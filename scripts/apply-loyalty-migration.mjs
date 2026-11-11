/**
 * Script para aplicar las migraciones de Loyalty y aislamiento de crédito por sede.
 * Usa prisma.$executeRawUnsafe para aplicar DDL directamente.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🔄 Aplicando migraciones de fidelización y aislamiento de crédito...")

  // 1. Eliminar unique constraint de CreditAccount (clientId era único globalmente)
  //    y añadir branchId + nuevo unique (clientId, branchId)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE CreditAccount ADD COLUMN IF NOT EXISTS branchId VARCHAR(191) NULL;`)
    console.log("✅ Columna branchId añadida a CreditAccount")
  } catch (e) {
    console.log("ℹ️  branchId ya existe en CreditAccount:", e.message)
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE CreditAccount DROP INDEX IF EXISTS CreditAccount_clientId_key;`)
    console.log("✅ Índice único clientId eliminado de CreditAccount")
  } catch (e) {
    console.log("ℹ️  Índice no encontrado o ya eliminado:", e.message)
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE CreditAccount ADD UNIQUE INDEX CreditAccount_clientId_branchId_key (clientId, branchId);`)
    console.log("✅ Índice único (clientId, branchId) añadido a CreditAccount")
  } catch (e) {
    console.log("ℹ️  Índice (clientId, branchId) ya existe:", e.message)
  }

  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS CreditAccount_branchId_idx ON CreditAccount(branchId);`)
    console.log("✅ Índice branchId añadido a CreditAccount")
  } catch (e) {
    console.log("ℹ️  Índice branchId ya existe:", e.message)
  }

  // 2. Crear tabla LoyaltyProgram
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS LoyaltyProgram (
        id                VARCHAR(191) NOT NULL,
        branchId          VARCHAR(191) NOT NULL,
        enabled           BOOLEAN      NOT NULL DEFAULT FALSE,
        pointsPerPurchase DOUBLE       NOT NULL DEFAULT 1,
        purchaseUnit      DOUBLE       NOT NULL DEFAULT 1000,
        pointValue        DOUBLE       NOT NULL DEFAULT 100,
        minPointsToRedeem INT          NOT NULL DEFAULT 50,
        maxRedeemPercent  DOUBLE       NOT NULL DEFAULT 50,
        expirationDays    INT          NULL,
        programName       VARCHAR(80)  NOT NULL DEFAULT 'Programa de Puntos',
        welcomePoints     INT          NOT NULL DEFAULT 0,
        birthdayPoints    INT          NOT NULL DEFAULT 0,
        createdAt         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt         DATETIME(3)  NOT NULL,
        PRIMARY KEY (id),
        UNIQUE INDEX LoyaltyProgram_branchId_key (branchId)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `)
    console.log("✅ Tabla LoyaltyProgram creada")
  } catch (e) {
    console.log("ℹ️  LoyaltyProgram ya existe:", e.message)
  }

  // 3. Crear tabla LoyaltyAccount
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS LoyaltyAccount (
        id            VARCHAR(191) NOT NULL,
        clientId      VARCHAR(191) NOT NULL,
        branchId      VARCHAR(191) NOT NULL,
        points        DOUBLE       NOT NULL DEFAULT 0,
        totalEarned   DOUBLE       NOT NULL DEFAULT 0,
        totalRedeemed DOUBLE       NOT NULL DEFAULT 0,
        createdAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updatedAt     DATETIME(3)  NOT NULL,
        PRIMARY KEY (id),
        UNIQUE INDEX LoyaltyAccount_clientId_branchId_key (clientId, branchId),
        INDEX LoyaltyAccount_branchId_idx (branchId),
        INDEX LoyaltyAccount_clientId_idx (clientId),
        CONSTRAINT LoyaltyAccount_clientId_fkey FOREIGN KEY (clientId) REFERENCES Client(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `)
    console.log("✅ Tabla LoyaltyAccount creada")
  } catch (e) {
    console.log("ℹ️  LoyaltyAccount ya existe:", e.message)
  }

  // 4. Crear tabla LoyaltyMovement
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS LoyaltyMovement (
        id           VARCHAR(191) NOT NULL,
        accountId    VARCHAR(191) NOT NULL,
        type         VARCHAR(191) NOT NULL,
        points       DOUBLE       NOT NULL,
        concept      VARCHAR(191) NOT NULL,
        saleId       VARCHAR(191) NULL,
        orderId      VARCHAR(191) NULL,
        registeredBy VARCHAR(191) NULL,
        createdAt    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX LoyaltyMovement_accountId_idx (accountId),
        INDEX LoyaltyMovement_saleId_idx (saleId),
        INDEX LoyaltyMovement_createdAt_idx (createdAt),
        CONSTRAINT LoyaltyMovement_accountId_fkey FOREIGN KEY (accountId) REFERENCES LoyaltyAccount(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `)
    console.log("✅ Tabla LoyaltyMovement creada")
  } catch (e) {
    console.log("ℹ️  LoyaltyMovement ya existe:", e.message)
  }

  console.log("\n🎉 Migración completada exitosamente.")
}

main()
  .catch((e) => {
    console.error("❌ Error en migración:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
