import { prisma } from '../client.js';
import type { Session, SessionStatus } from '../../types.js';

function isSessionStatus(value: string): value is SessionStatus {
  return value === 'clarifying' || value === 'completed' || value === 'abandoned';
}

function toSession(record: {
  id: string;
  status: string;
  turn_count: number;
  created_at: Date;
  updated_at: Date;
}): Session {
  if (!isSessionStatus(record.status)) {
    throw new Error(`Unsupported session status: ${record.status}`);
  }

  return {
    id: record.id,
    status: record.status,
    turn_count: record.turn_count,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export async function findSessionById(id: string): Promise<Session | null> {
  const session = await prisma.ideaSession.findUnique({ where: { id } });
  if (!session) return null;
  return toSession(session);
}

export async function createSession(): Promise<Session> {
  const session = await prisma.ideaSession.create({ data: {} });
  return toSession(session);
}

export async function incrementTurnCount(id: string): Promise<void> {
  await prisma.ideaSession.update({
    where: { id },
    data: { turn_count: { increment: 1 } },
  });
}

export async function updateSessionStatus(id: string, status: SessionStatus): Promise<void> {
  await prisma.ideaSession.update({
    where: { id },
    data: { status },
  });
}

export async function completeSessionWithFinalMessage(
  id: string,
  assistantMessage: string
): Promise<void> {
  await prisma.$transaction([
    prisma.sessionMessage.create({
      data: {
        session_id: id,
        role: 'assistant',
        input_mode: 'system',
        content: assistantMessage,
      },
    }),
    prisma.ideaSession.update({
      where: { id },
      data: { status: 'completed' },
    }),
  ]);
}
