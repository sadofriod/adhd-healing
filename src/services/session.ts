import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  DistillAttachment,
  LlmActivityEvent,
  LlmTokenUsage,
  PendingSessionTurn,
  SessionHistoryItem,
} from '../types';
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
  readonly activityEntries: LlmActivityEvent[];
  readonly messages: SessionMessage[];
  pendingTurn: PendingSessionTurn | null;
  status: SessionStatus;
  tokenUsage: LlmTokenUsage;
  researchMemory: readonly SessionResearchMemory[];
};

type SessionRuntimeContext = {
  currentSession: SessionState | null;
  selectedSessionId: string | null;
};

const sessionContextStorage = new AsyncLocalStorage<SessionRuntimeContext>();
let fallbackRuntimeContext = createRuntimeContext();
let pendingPersistence: Promise<void> = Promise.resolve();

export function runWithSessionContext<T>(operation: () => Promise<T> | T): Promise<T> {
  return sessionContextStorage.run(createRuntimeContext(), async () => operation());
}

function createRuntimeContext(): SessionRuntimeContext {
  return {
    currentSession: null,
    selectedSessionId: null,
  };
}

function getRuntimeContext(): SessionRuntimeContext {
  const existing = sessionContextStorage.getStore();
  if (existing) return existing;
  return fallbackRuntimeContext;
}

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

function requireJsonRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (isJsonRecord(value) && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error(errorMessage);
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

// eslint-disable-next-line complexity
function parseAttachment(value: unknown): DistillAttachment {
  const attachment = requireJsonRecord(value, 'Session pending turn contains an invalid attachment');
  if (typeof attachment.name !== 'string' || attachment.name.trim().length === 0) {
    throw new Error('Session pending turn contains an invalid attachment name');
  }
  if (typeof attachment.content !== 'string' || attachment.content.length === 0) {
    throw new Error('Session pending turn contains an invalid attachment content');
  }
  if (!Number.isSafeInteger(attachment.size) || Number(attachment.size) < 0) {
    throw new Error('Session pending turn contains an invalid attachment size');
  }
  if (attachment.mimeType !== undefined && typeof attachment.mimeType !== 'string') {
    throw new Error('Session pending turn contains an invalid attachment mime type');
  }
  return {
    name: attachment.name,
    content: attachment.content,
    size: Number(attachment.size),
    ...(attachment.mimeType === undefined ? {} : { mimeType: attachment.mimeType }),
  };
}

function parsePendingTurn(value: unknown): PendingSessionTurn {
  const pendingTurn = requireJsonRecord(value, 'Session pending turn contains an invalid payload');
  if (typeof pendingTurn.text !== 'string' || pendingTurn.text.trim().length === 0) {
    throw new Error('Session pending turn contains an invalid text');
  }
  const attachments = pendingTurn.attachments;
  if (!Array.isArray(attachments)) {
    throw new Error('Session pending turn contains invalid attachments');
  }
  return {
    text: pendingTurn.text,
    attachments: attachments.map(parseAttachment),
  };
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

function parseTokenCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Session activity contains an invalid ${label}: ${value}`);
  }
  return Number(value);
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  throw new Error(`Session activity contains an invalid ${label}`);
}

function parseProgressPhase(value: unknown): 'process' | 'tool-call' | 'sub-agent' {
  if (value === 'process' || value === 'tool-call' || value === 'sub-agent') return value;
  throw new Error(`Session activity contains an invalid progress phase: ${value}`);
}

// eslint-disable-next-line complexity
function parseActivityEvent(value: unknown): LlmActivityEvent {
  const event = requireJsonRecord(value, 'Session activity contains an invalid payload');
  if (event.type === 'progress') {
    if (typeof event.message !== 'string') {
      throw new Error('Session activity contains an invalid progress message');
    }
    return {
      type: 'progress',
      phase: parseProgressPhase(event.phase),
      message: event.message,
      details: parseOptionalString(event.details, 'progress details'),
      operationId: parseOptionalString(event.operationId, 'operation id'),
      ...(event.input === undefined ? {} : { input: event.input }),
      ...(event.output === undefined ? {} : { output: event.output }),
    };
  }

  if (event.type === 'usage') {
    if (typeof event.source !== 'string') {
      throw new Error('Session activity contains an invalid usage source');
    }
    if (typeof event.estimatedCostUsd !== 'number') {
      throw new Error('Session activity contains an invalid estimated cost');
    }
    const usage = requireJsonRecord(event.usage, 'Session activity contains an invalid usage payload');
    return {
      type: 'usage',
      source: event.source,
      usage: {
        inputTokens: parseTokenCount(usage.inputTokens, 'input token count'),
        outputTokens: parseTokenCount(usage.outputTokens, 'output token count'),
        totalTokens: parseTokenCount(usage.totalTokens, 'total token count'),
      },
      estimatedCostUsd: event.estimatedCostUsd,
    };
  }

  throw new Error(`Session activity contains an invalid event type: ${String(event.type)}`);
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
    activityEntries: [],
    messages: [],
    pendingTurn: null,
    status: 'ACTIVE',
    tokenUsage: EMPTY_TOKEN_USAGE,
    researchMemory: [],
  };
}

const SESSION_LOAD_QUERY = {
  include: {
    activityEntries: { orderBy: { id: 'asc' } },
    messages: { orderBy: { id: 'asc' } },
    researchMemory: { orderBy: { updatedAt: 'asc' } },
  },
} as const;

function toSessionState(persisted: {
  id: string;
  status: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pendingTurnJson: string | null;
  activityEntries: Array<{ eventJson: string }>;
  messages: Array<{ role: string; content: string }>;
  researchMemory: Array<{
    key: string;
    toolName: string;
    inputJson: string;
    outputJson: string;
  }>;
}): SessionState {
  const messages = persisted.messages.map(message => ({
    role: parseRole(message.role),
    content: message.content,
  }));
  const fallbackPendingTurn = getFallbackPendingTurn(messages);
  return {
    id: persisted.id,
    activityEntries: persisted.activityEntries.map(entry => parseActivityEvent(parseJson(entry.eventJson))),
    messages,
    pendingTurn: persisted.pendingTurnJson
      ? parsePendingTurn(parseJson(persisted.pendingTurnJson))
      : fallbackPendingTurn,
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

async function loadSessionById(sessionId: string): Promise<SessionState | null> {
  const persisted = await database.session.findUnique({
    ...SESSION_LOAD_QUERY,
    where: { id: sessionId },
  });
  if (!persisted) return null;
  return toSessionState(persisted);
}

function setRuntimeSession(session: SessionState | null): void {
  const runtime = getRuntimeContext();
  runtime.currentSession = session;
  runtime.selectedSessionId = session?.id ?? null;
}

async function ensureSession(): Promise<SessionState> {
  const runtime = getRuntimeContext();
  if (runtime.currentSession) return runtime.currentSession;
  if (runtime.selectedSessionId) {
    const selectedSession = await loadSessionById(runtime.selectedSessionId);
    if (!selectedSession) throw new Error(`Session not found: ${runtime.selectedSessionId}`);
    runtime.currentSession = selectedSession;
    return selectedSession;
  }
  runtime.currentSession = await createSession();
  runtime.selectedSessionId = runtime.currentSession.id;
  return runtime.currentSession;
}

function getSessionTitle(messages: readonly SessionMessage[]): string {
  const firstUserMessage = messages.find(message => message.role === 'user');
  if (!firstUserMessage) return '未命名会话';
  return firstUserMessage.content.slice(0, 48);
}

function getFallbackPendingTurn(messages: readonly SessionMessage[]): PendingSessionTurn | null {
  const latestMessage = messages.at(-1);
  if (!latestMessage) return null;
  if (latestMessage.role !== 'user') return null;
  return {
    text: latestMessage.content,
    attachments: [],
  };
}

function getPendingTurnInput(pendingTurn: PendingSessionTurn | null): string | null {
  return pendingTurn?.text ?? null;
}

function queuePendingTurnPersistence(
  sessionId: string,
  pendingTurn: PendingSessionTurn | null
): void {
  queuePersistence(() => database.session.update({
    where: { id: sessionId },
    data: { pendingTurnJson: pendingTurn ? serializeJson(pendingTurn) : null },
  }));
}

export async function listSessionHistory(): Promise<readonly SessionHistoryItem[]> {
  await flushSessionPersistence();
  const sessions = await database.session.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      activityEntries: { orderBy: { id: 'asc' } },
      messages: { orderBy: { id: 'asc' } },
    },
  });
  return sessions.map(session => {
    const messages = session.messages.map(message => ({
      role: parseRole(message.role),
      content: message.content,
    }));
    const pendingTurn = session.pendingTurnJson
      ? parsePendingTurn(parseJson(session.pendingTurnJson))
      : getFallbackPendingTurn(messages);
    return {
      id: session.id,
      status: parseStatus(session.status),
      title: getSessionTitle(messages),
      activityEntries: session.activityEntries.map(entry => parseActivityEvent(parseJson(entry.eventJson))),
      pendingTurnInput: getPendingTurnInput(pendingTurn),
      pendingTurn,
      messages,
      tokenUsage: {
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        totalTokens: session.totalTokens,
      },
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      finishedAt: session.finishedAt?.toISOString() ?? null,
    };
  });
}

export async function activateSession(sessionId: string): Promise<boolean> {
  await flushSessionPersistence();
  const selected = await database.session.findUnique({ where: { id: sessionId } });
  if (!selected) return false;
  await database.session.update({
    where: { id: sessionId },
    data: { status: 'ACTIVE', finishedAt: null },
  });
  setRuntimeSession(await loadSessionById(sessionId));
  return true;
}

export async function bindSession(sessionId: string): Promise<boolean> {
  await flushSessionPersistence();
  const session = await loadSessionById(sessionId);
  if (!session) return false;
  setRuntimeSession(session);
  return true;
}

export function getCurrentSessionId(): string | null {
  const runtime = getRuntimeContext();
  return runtime.currentSession?.id ?? runtime.selectedSessionId;
}

export function getSession(): SessionMessage[] {
  return getRuntimeContext().currentSession?.messages ?? [];
}

export function getSessionActivityEntries(): readonly LlmActivityEvent[] {
  return getRuntimeContext().currentSession?.activityEntries ?? [];
}

export async function resetSession(): Promise<void> {
  await flushSessionPersistence();
  const runtime = getRuntimeContext();
  const currentSession = runtime.currentSession
    ?? (runtime.selectedSessionId ? await loadSessionById(runtime.selectedSessionId) : null);
  if (currentSession?.status === 'ACTIVE') {
    await database.session.update({
      where: { id: currentSession.id },
      data: { status: 'ABANDONED', finishedAt: new Date() },
    });
  }
  runtime.currentSession = await createSession();
  runtime.selectedSessionId = runtime.currentSession.id;
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
  if (role === 'assistant') {
    session.pendingTurn = null;
    queuePendingTurnPersistence(session.id, null);
  }
}

export function recordSessionActivity(event: LlmActivityEvent): void {
  const runtime = getRuntimeContext();
  if (!runtime.currentSession) throw new Error('Cannot record session activity without a session');
  runtime.currentSession.activityEntries.push(event);
  const sessionId = runtime.currentSession.id;
  queuePersistence(() => database.sessionActivity.create({
    data: {
      sessionId,
      eventJson: serializeJson(event),
    },
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
  resume: boolean,
  pendingTurn: PendingSessionTurn = { text: content, attachments: [] }
): Promise<SessionMessage[]> {
  const session = await ensureSession();
  if (!resume) {
    await database.session.update({
      where: { id: session.id },
      data: { status: 'ACTIVE', finishedAt: null },
    });
    session.status = 'ACTIVE';
    session.pendingTurn = pendingTurn;
    queuePendingTurnPersistence(session.id, pendingTurn);
    await appendToSession('user', content);
    return session.messages;
  }
  const pendingMessage = session.messages.at(-1);
  if (isPendingUserMessage(pendingMessage, content)) return session.messages;
  throw new Error('当前没有可恢复的暂停任务');
}

export function clearSession(): void {
  setRuntimeSession(null);
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
  return getRuntimeContext().currentSession?.researchMemory ?? [];
}

export function addSessionTokenUsage(usage: LlmTokenUsage): void {
  const runtime = getRuntimeContext();
  if (!runtime.currentSession) throw new Error('Cannot record token usage without a session');
  runtime.currentSession.tokenUsage = addTokenUsage(runtime.currentSession.tokenUsage, usage);
  const tokenUsage = runtime.currentSession.tokenUsage;
  const sessionId = runtime.currentSession.id;
  queuePersistence(() => database.session.update({
    where: { id: sessionId },
    data: tokenUsage,
  }));
}

export function getSessionTokenUsage(): LlmTokenUsage {
  return getRuntimeContext().currentSession?.tokenUsage ?? EMPTY_TOKEN_USAGE;
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
  fallbackRuntimeContext = createRuntimeContext();
  clearSession();
}
