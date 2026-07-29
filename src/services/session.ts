import type { Session } from '../types.js';
import {
  findSessionById,
  createSession,
  incrementTurnCount,
} from '../db/queries/sessions.js';

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionStateError extends Error {
  constructor(sessionId: string, status: Session['status']) {
    super(`Session ${sessionId} is already ${status} and cannot accept more input`);
    this.name = 'SessionStateError';
  }
}

function assertSessionIsActive(session: Session): Session {
  if (session.status !== 'clarifying') {
    throw new SessionStateError(session.id, session.status);
  }

  return session;
}

async function resumeSession(sessionId: string): Promise<Session> {
  const session = await findSessionById(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
  return assertSessionIsActive(session);
}

export async function loadOrCreateSession(sessionId?: string): Promise<Session> {
  if (sessionId) return resumeSession(sessionId);
  return createSession();
}

export async function advanceTurn(sessionId: string): Promise<void> {
  await incrementTurnCount(sessionId);
}
