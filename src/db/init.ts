import { prisma } from './client.js';
import {
  ENABLE_PGCRYPTO,
  ENABLE_PGVECTOR,
  CREATE_IDEA_SESSIONS,
  CREATE_SESSION_MESSAGES,
  CREATE_MY_IDEAS,
} from './schema.js';

async function runSql(sql: string): Promise<void> {
  await prisma.$executeRawUnsafe(sql);
}

export async function initDatabase(): Promise<void> {
  console.log('[db] Initializing database...');
  await runSql(ENABLE_PGCRYPTO);
  await runSql(ENABLE_PGVECTOR);
  await runSql(CREATE_IDEA_SESSIONS);
  await runSql(CREATE_SESSION_MESSAGES);
  await runSql(CREATE_MY_IDEAS);
  console.log('[db] Database initialized.');
}
