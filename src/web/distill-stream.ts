import type {
  DistillApiResponse,
  DistillStreamEvent,
  LlmActivityEvent,
  LlmProgressPhase,
  LlmTokenUsage,
} from '../types';

type ActivityHandler = (event: LlmActivityEvent) => void;

type StreamState = {
  result: DistillApiResponse | null;
};

type EventParser = (value: Record<string, unknown>) => DistillStreamEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('服务端返回了无效的进度事件。');
  return value;
}

function isProgressPhase(value: unknown): value is LlmProgressPhase {
  return value === 'process' || value === 'tool-call' || value === 'sub-agent';
}

function isWorkflowStatus(value: unknown): value is DistillApiResponse['status'] {
  return value === 'CONTINUE' || value === 'FINISH' || value === 'PAUSED';
}

function parseResultText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('服务端返回了无效的结果内容。');
  return value;
}

function parseResult(value: Record<string, unknown>): DistillApiResponse {
  const status = value.status;
  if (!isWorkflowStatus(status)) throw new Error('服务端返回了无效的结果状态。');
  const text = parseResultText(value.text);
  if (status !== 'FINISH') return { status, text };
  return {
    status,
    text,
    tokenUsage: parseTokenUsage(value.tokenUsage),
  };
}

function parseTokenCount(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error('服务端返回了无效的 token 数量。');
  }
  return Number(value);
}

function parseTokenUsage(value: unknown): LlmTokenUsage {
  const usage = requireRecord(value);
  return {
    inputTokens: parseTokenCount(usage.inputTokens),
    outputTokens: parseTokenCount(usage.outputTokens),
    totalTokens: parseTokenCount(usage.totalTokens),
  };
}

function parseOptionalDetails(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('服务端返回了无效的进度详情。');
  return value;
}

function parseOptionalOperationId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('服务端返回了无效的调用 ID。');
  return value;
}

function parseProgressEvent(value: Record<string, unknown>): DistillStreamEvent {
  if (!isProgressPhase(value.phase)) throw new Error('服务端返回了无效的进度阶段。');
  if (typeof value.message !== 'string') throw new Error('服务端返回了无效的进度内容。');
  return {
    type: 'progress',
    phase: value.phase,
    message: value.message,
    details: parseOptionalDetails(value.details),
    operationId: parseOptionalOperationId(value.operationId),
    input: value.input,
    output: value.output,
  };
}

function parseUsageEvent(value: Record<string, unknown>): DistillStreamEvent {
  if (typeof value.source !== 'string') throw new Error('服务端返回了无效的 token 来源。');
  if (typeof value.estimatedCostUsd !== 'number') throw new Error('服务端返回了无效的 token 价格。');
  return {
    type: 'usage',
    source: value.source,
    usage: parseTokenUsage(value.usage),
    estimatedCostUsd: value.estimatedCostUsd,
  };
}

function parseResultEvent(value: Record<string, unknown>): DistillStreamEvent {
  return { type: 'result', result: parseResult(requireRecord(value.result)) };
}

function parseErrorEvent(value: Record<string, unknown>): DistillStreamEvent {
  if (typeof value.error !== 'string') throw new Error('服务端返回了无效的错误事件。');
  return { type: 'error', error: value.error };
}

const EVENT_PARSERS: Readonly<Record<string, EventParser>> = {
  progress: parseProgressEvent,
  usage: parseUsageEvent,
  result: parseResultEvent,
  error: parseErrorEvent,
};

function getEventParser(value: Record<string, unknown>): EventParser {
  if (typeof value.type !== 'string') throw new Error('服务端返回了无效的事件类型。');
  const parser = EVENT_PARSERS[value.type];
  if (!parser) throw new Error('服务端返回了无法识别的进度事件。');
  return parser;
}

function parseStreamEvent(line: string): DistillStreamEvent {
  const value = requireRecord(JSON.parse(line) as unknown);
  return getEventParser(value)(value);
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

function popRemainder(lines: string[]): string {
  const remainder = lines.pop();
  if (remainder === undefined) throw new Error('无法解析服务端进度流。');
  return remainder;
}

function consumeCompleteLines(
  buffer: string,
  onActivity: ActivityHandler,
  state: StreamState
): string {
  const lines = buffer.split('\n');
  const remainder = popRemainder(lines);
  for (const line of lines) {
    if (!line.trim()) continue;
    handleEvent(parseStreamEvent(line), onActivity, state);
  }
  return remainder;
}

async function getResponseError(response: Response): Promise<string> {
  const value = await response.json().catch(() => null) as unknown;
  if (isRecord(value) && typeof value.error === 'string') return value.error;
  return '请求失败，请检查服务端日志。';
}

export async function readDistillStream(
  response: Response,
  onActivity: ActivityHandler
): Promise<DistillApiResponse> {
  if (!response.ok) throw new Error(await getResponseError(response));
  if (!response.body) throw new Error('浏览器无法读取服务端进度流。');

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const state: StreamState = { result: null };
  const remainder = await readStreamChunks(reader, onActivity, state);
  return finishStream(remainder, onActivity, state);
}

async function readStreamChunks(
  reader: ReadableStreamDefaultReader<string>,
  onActivity: ActivityHandler,
  state: StreamState
): Promise<string> {
  let buffer = '';
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer = consumeCompleteLines(buffer + chunk.value, onActivity, state);
  }
  return buffer;
}

function finishStream(
  remainder: string,
  onActivity: ActivityHandler,
  state: StreamState
): DistillApiResponse {
  if (remainder.trim()) handleEvent(parseStreamEvent(remainder), onActivity, state);
  if (!state.result) throw new Error('服务端进度流未返回最终结果。');
  return state.result;
}
