import { PrismaClient } from "@prisma/client";

declare global {
  var __prisma: PrismaClient | undefined;
}

// Reuse the same PrismaClient instance across hot-reloads in development.
// In production a single instance is created once at module load time.
const prisma: PrismaClient =
  globalThis.__prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;
