import { prisma } from '../client.js';
import type { SessionMessage } from '../../types.js';

export async function insertMessage(
  sessionId: string,
  role: string,
  inputMode: string,
  content: string
): Promise<void> {
  await prisma.sessionMessage.create({
    data: {
      session_id: sessionId,
      role,
      input_mode: inputMode,
      content,
    },
  });
}

export async function getMessagesBySessionId(sessionId: string): Promise<SessionMessage[]> {
  return prisma.sessionMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: 'asc' },
  });
}
