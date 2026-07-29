import { prisma } from '../client.js';
import type { SessionMessage } from '../../types.js';

function isMessageRole(value: string): value is SessionMessage['role'] {
  return value === 'user' || value === 'assistant';
}

function isStoredInputMode(value: string): value is SessionMessage['input_mode'] {
  return value === 'audio' || value === 'text' || value === 'system';
}

function toSessionMessage(record: {
  id: number;
  session_id: string;
  role: string;
  input_mode: string;
  content: string;
  created_at: Date;
}): SessionMessage {
  if (!isMessageRole(record.role)) {
    throw new Error(`Unsupported message role: ${record.role}`);
  }

  if (!isStoredInputMode(record.input_mode)) {
    throw new Error(`Unsupported input mode: ${record.input_mode}`);
  }

  return {
    id: record.id,
    session_id: record.session_id,
    role: record.role,
    input_mode: record.input_mode,
    content: record.content,
    created_at: record.created_at,
  };
}

export async function insertMessage(
  sessionId: string,
  role: SessionMessage['role'],
  inputMode: SessionMessage['input_mode'],
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
  const messages = await prisma.sessionMessage.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: 'asc' },
  });

  return messages.map(toSessionMessage);
}
