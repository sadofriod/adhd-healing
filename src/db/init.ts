import { getPool } from './client.js';
import {
  ENABLE_PGVECTOR,
  CREATE_IDEA_SESSIONS,
  CREATE_SESSION_MESSAGES,
  CREATE_MY_IDEAS,
} from './schema.js';

async function runSql(sql: string): Promise<void> {
  await getPool().query(sql);
}

export async function initDatabase(): Promise<void> {
  console.log('[db] Initializing database...');
  await runSql(ENABLE_PGVECTOR);
  await runSql(CREATE_IDEA_SESSIONS);
  await runSql(CREATE_SESSION_MESSAGES);
  await runSql(CREATE_MY_IDEAS);
  console.log('[db] Database initialized.');
}
