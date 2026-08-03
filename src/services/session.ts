import type { LlmTokenUsage } from '../types';
import { addTokenUsage, EMPTY_TOKEN_USAGE } from './token-usage';

export type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SessionResearchMemory = {
  readonly key: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
};

export type SessionResearchEvidence = Omit<SessionResearchMemory, 'key'>;

let currentSession: SessionMessage[] | null = null;
let currentTokenUsage: LlmTokenUsage = EMPTY_TOKEN_USAGE;
let currentResearchMemory: readonly SessionResearchMemory[] = [];

function sortJsonRecord(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(
      ([key, child]) => [key, sortJsonValue(child)]
    )
  );
}

function isJsonRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (isJsonRecord(value)) return sortJsonRecord(value);
  return value;
}

function createResearchMemoryKey(toolName: string, input: unknown): string {
  return `${toolName}:${JSON.stringify(sortJsonValue(input))}`;
}

export function getSession(): SessionMessage[] {
  if (!currentSession) currentSession = [];
  return currentSession;
}

export function resetSession(): void {
  currentSession = [];
  currentTokenUsage = EMPTY_TOKEN_USAGE;
  currentResearchMemory = [];
  console.log('[session] 开启新一轮脑暴 Session');
}

export function appendToSession(role: 'user' | 'assistant', content: string): void {
  if (!currentSession) currentSession = [];
  currentSession.push({ role, content });
}

function isPendingUserMessage(
  message: SessionMessage | undefined,
  content: string
): boolean {
  if (!message) return false;
  return message.role === 'user' && message.content === content;
}

export function prepareUserTurn(content: string, resume: boolean): SessionMessage[] {
  const session = getSession();
  if (!resume) {
    session.push({ role: 'user', content });
    return session;
  }
  const pendingMessage = session.at(-1);
  if (isPendingUserMessage(pendingMessage, content)) return session;
  throw new Error('当前没有可恢复的暂停任务');
}

export function clearSession(): void {
  currentSession = null;
  currentTokenUsage = EMPTY_TOKEN_USAGE;
  currentResearchMemory = [];
}

export function rememberSessionResearch(evidence: SessionResearchEvidence): void {
  const key = createResearchMemoryKey(evidence.toolName, evidence.input);
  const entry = { key, ...evidence };
  currentResearchMemory = [
    ...currentResearchMemory.filter(memory => memory.key !== key),
    entry,
  ];
}

export function getSessionResearchMemory(): readonly SessionResearchMemory[] {
  return currentResearchMemory;
}

export function addSessionTokenUsage(usage: LlmTokenUsage): void {
  currentTokenUsage = addTokenUsage(currentTokenUsage, usage);
}

export function getSessionTokenUsage(): LlmTokenUsage {
  return currentTokenUsage;
}
