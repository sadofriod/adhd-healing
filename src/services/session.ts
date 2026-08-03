import type { LlmTokenUsage } from '../types';
import { database } from './database';
import { addTokenUsage, EMPTY_TOKEN_USAGE } from './token-usage';

export type SessionMessage = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};

export type SessionResearchMemory = {
  readonly key: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly output: unknown;
};

export type SessionResearchEvidence = Omit<SessionResearchMemory, 'key'>;

type SessionStatus = 'ACTIVE' | 'FINISHED' | 'ABANDONED';

const SESSION_STATUS_BY_VALUE: Readonly<Record<string, SessionStatus | undefined>> = {
  ACTIVE: 'ACTIVE',
  FINISHED: 'FINISHED',
  ABANDONED: 'ABANDONED',
};

type SessionState = {
  readonly id: string;
  readonly messages: SessionMessage[];
  status: SessionStatus;
  tokenUsage: LlmTokenUsage;
  researchMemory: readonly SessionResearchMemory[];
};

let currentSession: SessionState | null = null;
let pendingPersistence: Promise<void> = Promise.resolve();

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

function serializeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return JSON.stringify(String(value));
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function createResearchMemoryKey(toolName: string, input: unknown): string {
  return `${toolName}:${serializeJson(sortJsonValue(input))}`;
}

function parseRole(role: string): SessionMessage['role'] {
  if (role === 'user' || role === 'assistant') return role;
  throw new Error(`Session history contains an invalid role: ${role}`);
}

function parseStatus(status: string): SessionStatus {
  const parsedStatus = SESSION_STATUS_BY_VALUE[status];
  if (parsedStatus) return parsedStatus;
  throw new Error(`Session history contains an invalid status: ${status}`);
}

function queuePersistence(operation: () => Promise<unknown>): void {
  pendingPersistence = pendingPersistence.then(async () => {
    await operation();
  });
}

async function createSession(): Promise<SessionState> {
  const session = await database.session.create({ data: {} });
  return {
    id: session.id,
    messages: [],
    status: 'ACTIVE',
    tokenUsage: EMPTY_TOKEN_USAGE,
    researchMemory: [],
  };
}

async function loadLatestSession(): Promise<SessionState> {
  const query = {
    include: {
      messages: { orderBy: { id: 'asc' } },
      researchMemory: { orderBy: { updatedAt: 'asc' } },
    },
    orderBy: { updatedAt: 'desc' },
  } as const;
  const persisted = await database.session.findFirst({
    ...query,
    where: { status: 'ACTIVE' },
  }) ?? await database.session.findFirst(query);
  if (!persisted) return createSession();
  return {
    id: persisted.id,
    messages: persisted.messages.map(message => ({
      role: parseRole(message.role),
      content: message.content,
    })),
    status: parseStatus(persisted.status),
    tokenUsage: {
      inputTokens: persisted.inputTokens,
      outputTokens: persisted.outputTokens,
      totalTokens: persisted.totalTokens,
    },
    researchMemory: persisted.researchMemory.map(memory => ({
      key: memory.key,
      toolName: memory.toolName,
      input: parseJson(memory.inputJson),
      output: parseJson(memory.outputJson),
    })),
  };
}

async function ensureSession(): Promise<SessionState> {
  if (!currentSession) currentSession = await loadLatestSession();
  return currentSession;
}

export function getSession(): SessionMessage[] {
  return currentSession?.messages ?? [];
}

export async function resetSession(): Promise<void> {
  await flushSessionPersistence();
  if (currentSession?.status === 'ACTIVE') {
    await database.session.update({
      where: { id: currentSession.id },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
  } else {
    await database.session.updateMany({
      where: { status: 'ACTIVE' },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
  }
  currentSession = await createSession();
  console.log('[session] 开启新一轮脑暴 Session');
}

export async function appendToSession(
  role: SessionMessage['role'],
  content: string
): Promise<void> {
  const session = await ensureSession();
  session.messages.push({ role, content });
  queuePersistence(() => database.sessionMessage.create({
    data: { sessionId: session.id, role, content },
  }));
}

function isPendingUserMessage(
  message: SessionMessage | undefined,
  content: string
): boolean {
  if (!message) return false;
  return message.role === 'user' && message.content === content;
}

export async function prepareUserTurn(
  content: string,
  resume: boolean
): Promise<SessionMessage[]> {
  const session = await ensureSession();
  if (!resume) {
    await database.session.update({
      where: { id: session.id },
      data: { status: 'ACTIVE', finishedAt: null },
    });
    session.status = 'ACTIVE';
    await appendToSession('user', content);
    return session.messages;
  }
  const pendingMessage = session.messages.at(-1);
  if (isPendingUserMessage(pendingMessage, content)) return session.messages;
  throw new Error('当前没有可恢复的暂停任务');
}

export function clearSession(): void {
  currentSession = null;
  pendingPersistence = Promise.resolve();
}

export async function rememberSessionResearch(
  evidence: SessionResearchEvidence
): Promise<void> {
  const session = await ensureSession();
  const key = createResearchMemoryKey(evidence.toolName, evidence.input);
  const entry = { key, ...evidence };
  session.researchMemory = [
    ...session.researchMemory.filter(memory => memory.key !== key),
    entry,
  ];
  queuePersistence(() => database.sessionResearchMemory.upsert({
    where: { sessionId_key: { sessionId: session.id, key } },
    create: {
      sessionId: session.id,
      key,
      toolName: evidence.toolName,
      inputJson: serializeJson(evidence.input),
      outputJson: serializeJson(evidence.output),
    },
    update: {
      toolName: evidence.toolName,
      inputJson: serializeJson(evidence.input),
      outputJson: serializeJson(evidence.output),
    },
  }));
}

export function getSessionResearchMemory(): readonly SessionResearchMemory[] {
  return currentSession?.researchMemory ?? [];
}

export function addSessionTokenUsage(usage: LlmTokenUsage): void {
  if (!currentSession) throw new Error('Cannot record token usage without a session');
  currentSession.tokenUsage = addTokenUsage(currentSession.tokenUsage, usage);
  const tokenUsage = currentSession.tokenUsage;
  const sessionId = currentSession.id;
  queuePersistence(() => database.session.update({
    where: { id: sessionId },
    data: tokenUsage,
  }));
}

export function getSessionTokenUsage(): LlmTokenUsage {
  return currentSession?.tokenUsage ?? EMPTY_TOKEN_USAGE;
}

export async function markSessionFinished(): Promise<void> {
  const session = await ensureSession();
  await flushSessionPersistence();
  await database.session.update({
    where: { id: session.id },
    data: { status: 'FINISHED', finishedAt: new Date() },
  });
  session.status = 'FINISHED';
}

export async function flushSessionPersistence(): Promise<void> {
  await pendingPersistence;
}

export async function deleteSessionHistory(): Promise<void> {
  await flushSessionPersistence();
  await database.session.deleteMany();
  clearSession();
}
