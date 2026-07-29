import type { Session } from '../types.js';
import {
  findSessionById,
  createSession,
  incrementTurnCount,
} from '../db/queries/sessions.js';

async function resumeSession(sessionId: string): Promise<Session> {
  const session = await findSessionById(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  return session;
}

export async function loadOrCreateSession(sessionId?: string): Promise<Session> {
  if (sessionId) return resumeSession(sessionId);
  return createSession();
}

export async function advanceTurn(sessionId: string): Promise<void> {
  await incrementTurnCount(sessionId);
}
