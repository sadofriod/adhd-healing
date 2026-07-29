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

function messagesToRawText(messages: SessionMessage[]): string {
  const userMessages = messages
    .filter(message => message.role === 'user')
    .map(message => message.content.trim())
    .filter(Boolean);

  return userMessages.join('\n\n');
}

export async function buildSessionContext(sessionId: string): Promise<string> {
  const messages = await getMessagesBySessionId(sessionId);
  return messagesToContext(messages);
}

export async function buildSessionArtifacts(
  sessionId: string
): Promise<{ sessionContext: string; rawText: string }> {
  const messages = await getMessagesBySessionId(sessionId);

  return {
    sessionContext: messagesToContext(messages),
    rawText: messagesToRawText(messages),
  };
}
