import { validateDistillRequest, ValidationError } from './validate.js';
import { processDistill } from './process.js';
import { SessionNotFoundError, SessionStateError } from '../../services/session.js';

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

function summarizeRequestData(reqData: Awaited<ReturnType<typeof validateDistillRequest>>): Record<string, unknown> {
  if (reqData.inputMode === 'text') {
    return {
      inputMode: reqData.inputMode,
      sessionId: reqData.sessionId ?? null,
      textLength: reqData.text.length,
      textPreview: reqData.text.slice(0, 120),
    };
  }

  return {
    inputMode: reqData.inputMode,
    sessionId: reqData.sessionId ?? null,
    audioFileName: reqData.audioFileName,
    audioMimeType: reqData.audioMimeType,
    audioBytes: reqData.audioBuffer.length,
  };
}

function summarizeResult(result: Awaited<ReturnType<typeof processDistill>>): Record<string, unknown> {
  return {
    sessionId: result.session_id,
    turnIndex: result.turn_index,
    isComplete: result.is_complete,
    assistantMessageLength: result.assistant_message.length,
  };
}

function isClientRequestError(
  error: unknown
): error is ValidationError | SessionNotFoundError {
  return [ValidationError, SessionNotFoundError].some(ErrorType => error instanceof ErrorType);
}

function getHandledErrorResponse(error: unknown): Response | null {
  if (isClientRequestError(error)) {
    return errorResponse(400, error.message);
  }

  if (error instanceof SessionStateError) {
    return errorResponse(409, error.message);
  }

  return null;
}

export async function handleDistill(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const contentType = req.headers.get('content-type') ?? 'unknown';

  console.info(`[distill:${requestId}] Request started`, {
    method: req.method,
    contentType,
    url: req.url,
  });

  try {
    const reqData = await validateDistillRequest(req);
    console.info(`[distill:${requestId}] Request validated`, summarizeRequestData(reqData));

    const result = await processDistill(reqData);
    console.info(`[distill:${requestId}] Request completed`, {
      ...summarizeResult(result),
      durationMs: Date.now() - startedAt,
    });

    return jsonResponse(result);
  } catch (error) {
    const handledResponse = getHandledErrorResponse(error);
    if (handledResponse) {
      console.warn(`[distill:${requestId}] Request failed`, {
        contentType,
        durationMs: Date.now() - startedAt,
        error: getErrorMessage(error),
      });
      return handledResponse;
    }

    console.error(`[distill:${requestId}] Unhandled error`, {
      contentType,
      durationMs: Date.now() - startedAt,
    }, error);
    return errorResponse(500, getErrorMessage(error));
  }
}
