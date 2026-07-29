import { getPool } from '../client.js';
import type { SessionMessage } from '../../types.js';

export async function insertMessage(
  sessionId: string,
  role: string,
  inputMode: string,
  content: string
): Promise<void> {
  await getPool().query(
    `INSERT INTO session_messages (session_id, role, input_mode, content)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, role, inputMode, content]
  );
}

export async function getMessagesBySessionId(sessionId: string): Promise<SessionMessage[]> {
  const result = await getPool().query<SessionMessage>(
    `SELECT id, session_id, role, input_mode, content, created_at
     FROM session_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows;
}
