import { getPool } from '../client.js';
import type { Session, SessionStatus } from '../../types.js';

const SESSION_COLUMNS = 'id, status, turn_count, created_at, updated_at';

export async function findSessionById(id: string): Promise<Session | null> {
  const result = await getPool().query<Session>(
    `SELECT ${SESSION_COLUMNS} FROM idea_sessions WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSession(): Promise<Session> {
  const result = await getPool().query<Session>(
    `INSERT INTO idea_sessions (status, turn_count) VALUES ('clarifying', 0)
     RETURNING ${SESSION_COLUMNS}`
  );
  return result.rows[0];
}

export async function incrementTurnCount(id: string): Promise<void> {
  await getPool().query(
    `UPDATE idea_sessions SET turn_count = turn_count + 1, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  await getPool().query(
    `UPDATE idea_sessions SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, id]
  );
}
