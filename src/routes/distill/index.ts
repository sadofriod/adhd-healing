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
  try {
    const reqData = await validateDistillRequest(req);
    const result = await processDistill(reqData);
    return jsonResponse(result);
  } catch (error) {
    const handledResponse = getHandledErrorResponse(error);
    if (handledResponse) return handledResponse;

    console.error('[distill] Unhandled error:', error);
    return errorResponse(500, getErrorMessage(error));
  }
}
