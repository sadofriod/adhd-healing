import { prisma } from '../client.js';
import type { Session, SessionStatus } from '../../types.js';

export async function findSessionById(id: string): Promise<Session | null> {
  return prisma.ideaSession.findUnique({ where: { id } });
}

export async function createSession(): Promise<Session> {
  return prisma.ideaSession.create({ data: {} });
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
