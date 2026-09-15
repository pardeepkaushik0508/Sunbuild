import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaId?: string;
};

/**
 * Bump when Selection/Photo Prisma fields change so `next dev` does not
 * keep a stale PrismaClient on globalThis after generate.
 */
const PRISMA_SCHEMA_ID = "crm-audit-payments-warranty-v1";

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma =
  globalForPrisma.prismaSchemaId === PRISMA_SCHEMA_ID && globalForPrisma.prisma
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaId = PRISMA_SCHEMA_ID;
}
