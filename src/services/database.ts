import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';

function getDatabaseUrl(): string {
  const fallbackUrl = `file:${resolve(process.cwd(), 'data/sessions.db')}`;
  const rawDatabaseUrl = Bun.env.DATABASE_URL?.trim();

  if (!rawDatabaseUrl) return fallbackUrl;
  if (rawDatabaseUrl.startsWith('file:')) return rawDatabaseUrl;
  if (/^[a-z][a-z\d+.-]*:/i.test(rawDatabaseUrl)) return fallbackUrl;

  return `file:${resolve(process.cwd(), rawDatabaseUrl)}`;
}

const globalDatabase = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const database = globalDatabase.prisma ?? new PrismaClient({
  datasourceUrl: getDatabaseUrl(),
});

if (Bun.env.NODE_ENV !== 'production') globalDatabase.prisma = database;