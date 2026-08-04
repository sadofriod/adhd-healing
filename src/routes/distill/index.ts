import type {
  DistillApiResponse,
  DistillRequest,
  DistillStreamEvent,
  LlmActivityReporter,
} from '../../types';
import { getRequestLocale } from '../../i18n/locale';
import { isRecoverableNetworkError } from '../../services/network-error';
import { validateDistillRequest, ValidationError } from './validate';
import { processDistill } from './process';

const HEARTBEAT_INTERVAL_MS = 5_000;

type DistillProcessor = (
  reqData: DistillRequest,
  reportProgress: LlmActivityReporter
) => Promise<DistillApiResponse>;

type StreamWriter = {
  readonly cancel: () => void;
  readonly close: () => void;
  readonly writeEvent: (event: DistillStreamEvent) => void;
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getHandledErrorResponse(error: unknown): Response | null {
  if (error instanceof ValidationError) {
    return errorResponse(400, error.message);
  }
  return null;
}

function createStreamWriter(
  controller: ReadableStreamDefaultController<string>,
  heartbeatIntervalMs: number
): StreamWriter {
  let isOpen = true;
  const writeChunk = (chunk: string): void => {
    if (!isOpen) return;
    controller.enqueue(chunk);
  };
  const heartbeat = setInterval(() => writeChunk('\n'), heartbeatIntervalMs);
  const stop = (): void => {
    if (!isOpen) return;
    isOpen = false;
    clearInterval(heartbeat);
  };
  return {
    cancel: stop,
    close: () => {
      if (!isOpen) return;
      stop();
      controller.close();
    },
    writeEvent: event => writeChunk(`${JSON.stringify(event)}\n`),
  };
}

async function streamDistill(
  reqData: DistillRequest,
  writer: StreamWriter,
  requestId: string,
  startedAt: number,
  processor: DistillProcessor
): Promise<void> {
  const reportProgress: LlmActivityReporter = writer.writeEvent;
  try {
    const result = await processor(reqData, reportProgress);
    writer.writeEvent({ type: 'result', result });
    console.info(`[distill:${requestId}] Completed in ${Date.now() - startedAt}ms`, {
      status: result.status,
    });
  } catch (error) {
    const message = getErrorMessage(error);
    if (isRecoverableNetworkError(error)) {
      console.warn(`[distill:${requestId}] Paused after network failure (${Date.now() - startedAt}ms)`, error);
      writer.writeEvent({ type: 'result', result: { status: 'PAUSED', text: message } });
    } else {
      console.error(`[distill:${requestId}] Unhandled error (${Date.now() - startedAt}ms)`, error);
      writer.writeEvent({ type: 'error', error: message });
    }
  } finally {
    writer.close();
  }
}

export function createStreamResponse(
  reqData: DistillRequest,
  requestId: string,
  startedAt: number,
  processor: DistillProcessor,
  heartbeatIntervalMs: number
): Response {
  let cancelStream = (): void => undefined;
  const stream = new ReadableStream<string>({
    start(controller) {
      const writer = createStreamWriter(controller, heartbeatIntervalMs);
      cancelStream = writer.cancel;
      void streamDistill(reqData, writer, requestId, startedAt, processor);
    },
    cancel: () => cancelStream(),
  }).pipeThrough(new TextEncoderStream());
  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  });
}

function createProductionStreamResponse(
  reqData: DistillRequest,
  requestId: string,
  startedAt: number
): Response {
  return createStreamResponse(
    reqData,
    requestId,
    startedAt,
    processDistill,
    HEARTBEAT_INTERVAL_MS
  );
}

export async function handleDistill(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const locale = getRequestLocale(req);

  console.info(`[distill:${requestId}] Request started`);

  try {
    const reqData = await validateDistillRequest(req, locale);
    return createProductionStreamResponse(reqData, requestId, startedAt);
  } catch (error) {
    const handledResponse = getHandledErrorResponse(error);
    if (handledResponse) {
      console.warn(`[distill:${requestId}] Validation error: ${getErrorMessage(error)}`);
      return handledResponse;
    }
    console.error(`[distill:${requestId}] Request setup error`, error);
    return errorResponse(500, getErrorMessage(error));
  }
}
