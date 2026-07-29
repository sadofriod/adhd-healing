import { getMessagesBySessionId } from '../db/queries/messages.js';
import type { SessionMessage } from '../types.js';

function formatMessage(msg: SessionMessage): string {
  const label = msg.role === 'user' ? '用户' : '助手';
  return `${label}: ${msg.content}`;
}

function messagesToContext(messages: SessionMessage[]): string {
  if (messages.length === 0) return '（暂无会话记录）';
  return messages.map(formatMessage).join('\n');
}

export async function buildSessionContext(sessionId: string): Promise<string> {
  const messages = await getMessagesBySessionId(sessionId);
  return messagesToContext(messages);
}
