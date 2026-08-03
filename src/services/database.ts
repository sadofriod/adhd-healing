import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';

function getDatabaseUrl(): string {
  return Bun.env.DATABASE_URL ?? `file:${resolve(process.cwd(), 'data/sessions.db')}`;
}

const globalDatabase = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const database = globalDatabase.prisma ?? new PrismaClient({
  datasourceUrl: getDatabaseUrl(),
});

if (Bun.env.NODE_ENV !== 'production') globalDatabase.prisma = database;