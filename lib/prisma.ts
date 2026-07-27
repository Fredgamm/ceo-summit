import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton — prevents exhausting DB connections during Next.js
 * hot-reload in development (each reload would otherwise instantiate a new client).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
