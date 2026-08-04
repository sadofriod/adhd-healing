import type {
  DistillApiResponse,
  DistillStreamEvent,
  LlmActivityEvent,
  LlmProgressPhase,
  LlmTokenUsage,
} from '../types';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale';
import { getWebMessage } from './i18n/messages';

type ActivityHandler = (event: LlmActivityEvent) => void;

type StreamState = {
  result: DistillApiResponse | null;
};

type EventParser = (value: Record<string, unknown>, locale: Locale) => DistillStreamEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown, locale: Locale): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(getWebMessage(locale, 'streamInvalidRecord'));
  return value;
}

function isProgressPhase(value: unknown): value is LlmProgressPhase {
  return value === 'process' || value === 'tool-call' || value === 'sub-agent';
}

function isWorkflowStatus(value: unknown): value is DistillApiResponse['status'] {
  return value === 'CONTINUE' || value === 'FINISH' || value === 'PAUSED';
}

function parseResultText(value: unknown, locale: Locale): string {
  if (typeof value !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidResultText'));
  return value;
}

function parseSessionId(value: unknown, locale: Locale): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(getWebMessage(locale, 'streamInvalidRecord'));
  }
  return value;
}

function parseResult(value: Record<string, unknown>, locale: Locale): DistillApiResponse {
  const status = value.status;
  if (!isWorkflowStatus(status)) throw new Error(getWebMessage(locale, 'streamInvalidResultStatus'));
  const text = parseResultText(value.text, locale);
  const sessionId = parseSessionId(value.sessionId, locale);
  if (status !== 'FINISH') return { status, sessionId, text };
  return {
    status,
    sessionId,
    text,
    tokenUsage: parseTokenUsage(value.tokenUsage, locale),
  };
}

function parseTokenCount(value: unknown, locale: Locale): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(getWebMessage(locale, 'streamInvalidTokenCount'));
  }
  return Number(value);
}

function parseTokenUsage(value: unknown, locale: Locale): LlmTokenUsage {
  const usage = requireRecord(value, locale);
  return {
    inputTokens: parseTokenCount(usage.inputTokens, locale),
    outputTokens: parseTokenCount(usage.outputTokens, locale),
    totalTokens: parseTokenCount(usage.totalTokens, locale),
  };
}

function parseOptionalDetails(value: unknown, locale: Locale): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidDetails'));
  return value;
}

function parseOptionalOperationId(value: unknown, locale: Locale): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidOperationId'));
  return value;
}

function parseProgressEvent(value: Record<string, unknown>, locale: Locale): DistillStreamEvent {
  if (!isProgressPhase(value.phase)) throw new Error(getWebMessage(locale, 'streamInvalidPhase'));
  if (typeof value.message !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidProgressMessage'));
  return {
    type: 'progress',
    phase: value.phase,
    message: value.message,
    details: parseOptionalDetails(value.details, locale),
    operationId: parseOptionalOperationId(value.operationId, locale),
    input: value.input,
    output: value.output,
  };
}

function parseUsageEvent(value: Record<string, unknown>, locale: Locale): DistillStreamEvent {
  if (typeof value.source !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidUsageSource'));
  if (typeof value.estimatedCostUsd !== 'number') throw new Error(getWebMessage(locale, 'streamInvalidUsageCost'));
  return {
    type: 'usage',
    source: value.source,
    usage: parseTokenUsage(value.usage, locale),
    estimatedCostUsd: value.estimatedCostUsd,
  };
}

function parseResultEvent(value: Record<string, unknown>, locale: Locale): DistillStreamEvent {
  return { type: 'result', result: parseResult(requireRecord(value.result, locale), locale) };
}

function parseErrorEvent(value: Record<string, unknown>, locale: Locale): DistillStreamEvent {
  if (typeof value.error !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidErrorEvent'));
  return { type: 'error', error: value.error };
}

const EVENT_PARSERS: Readonly<Record<string, EventParser>> = {
  progress: parseProgressEvent,
  usage: parseUsageEvent,
  result: parseResultEvent,
  error: parseErrorEvent,
};

function getEventParser(value: Record<string, unknown>, locale: Locale): EventParser {
  if (typeof value.type !== 'string') throw new Error(getWebMessage(locale, 'streamInvalidEventType'));
  const parser = EVENT_PARSERS[value.type];
  if (!parser) throw new Error(getWebMessage(locale, 'streamUnknownEvent'));
  return parser;
}

function parseStreamEvent(line: string, locale: Locale): DistillStreamEvent {
  const value = requireRecord(JSON.parse(line) as unknown, locale);
  return getEventParser(value, locale)(value, locale);
}

function handleEvent(
  event: DistillStreamEvent,
  onActivity: ActivityHandler,
  state: StreamState
): void {
  if (isActivityEvent(event)) {
    onActivity(event);
    return;
  }
  if (event.type === 'error') throw new Error(event.error);
  state.result = event.result;
}

function isActivityEvent(event: DistillStreamEvent): event is LlmActivityEvent {
  return event.type === 'progress' || event.type === 'usage';
}

function popRemainder(lines: string[], locale: Locale): string {
  const remainder = lines.pop();
  if (remainder === undefined) throw new Error(getWebMessage(locale, 'streamParseRemainderFailed'));
  return remainder;
}

function consumeCompleteLines(
  buffer: string,
  onActivity: ActivityHandler,
  state: StreamState,
  locale: Locale
): string {
  const lines = buffer.split('\n');
  const remainder = popRemainder(lines, locale);
  for (const line of lines) {
    if (!line.trim()) continue;
    handleEvent(parseStreamEvent(line, locale), onActivity, state);
  }
  return remainder;
}

async function getResponseError(response: Response, locale: Locale): Promise<string> {
  const value = await response.json().catch(() => null) as unknown;
  if (isRecord(value) && typeof value.error === 'string') return value.error;
  return getWebMessage(locale, 'streamRequestFailed');
}

async function assertResponseIsOk(response: Response, locale: Locale): Promise<void> {
  if (response.ok) return;
  throw new Error(await getResponseError(response, locale));
}

function getResponseBody(response: Response, locale: Locale): ReadableStream<Uint8Array> {
  if (!response.body) throw new Error(getWebMessage(locale, 'streamBodyMissing'));
  return response.body;
}

function createTextStream(response: Response, locale: Locale): ReadableStream<string> {
  const decoder = new TextDecoder();
  return getResponseBody(response, locale).pipeThrough(new TransformStream<Uint8Array, string>({
    transform(chunk, controller) {
      controller.enqueue(decoder.decode(chunk, { stream: true }));
    },
    flush(controller) {
      const remainder = decoder.decode();
      if (remainder) controller.enqueue(remainder);
    },
  }));
}

function createStreamReader(
  response: Response,
  locale: Locale
): ReadableStreamDefaultReader<string> {
  return createTextStream(response, locale).getReader();
}

export async function readDistillStream(
  response: Response,
  onActivity: ActivityHandler,
  locale: Locale = DEFAULT_LOCALE
): Promise<DistillApiResponse> {
  await assertResponseIsOk(response, locale);

  const reader = createStreamReader(response, locale);
  const state: StreamState = { result: null };
  const remainder = await readStreamChunks(reader, onActivity, state, locale);
  return finishStream(remainder, onActivity, state, locale);
}

async function readStreamChunks(
  reader: ReadableStreamDefaultReader<string>,
  onActivity: ActivityHandler,
  state: StreamState,
  locale: Locale
): Promise<string> {
  let buffer = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer = consumeCompleteLines(buffer + chunk.value, onActivity, state, locale);
  }
  return buffer;
}

function finishStream(
  remainder: string,
  onActivity: ActivityHandler,
  state: StreamState,
  locale: Locale
): DistillApiResponse {
  if (remainder.trim()) handleEvent(parseStreamEvent(remainder, locale), onActivity, state);
  if (!state.result) throw new Error(getWebMessage(locale, 'streamMissingResult'));
  return state.result;
}
