import { validateDistillRequest, ValidationError } from './validate.js';
import { processDistill } from './process.js';

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

export async function handleDistill(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  console.info(`[distill:${requestId}] Request started`);

  try {
    const reqData = await validateDistillRequest(req);
    const result = await processDistill(reqData);

    console.info(`[distill:${requestId}] Completed in ${Date.now() - startedAt}ms`, {
      status: result.status,
    });

    return jsonResponse(result);
  } catch (error) {
    const handledResponse = getHandledErrorResponse(error);
    if (handledResponse) {
      console.warn(`[distill:${requestId}] Validation error: ${getErrorMessage(error)}`);
      return handledResponse;
    }

    console.error(`[distill:${requestId}] Unhandled error (${Date.now() - startedAt}ms)`, error);
    return errorResponse(500, getErrorMessage(error));
  }
}
