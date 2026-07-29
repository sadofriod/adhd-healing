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

export async function handleDistill(req: Request): Promise<Response> {
  try {
    const reqData = await validateDistillRequest(req);
    const result = await processDistill(reqData);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof ValidationError) return errorResponse(400, error.message);
    console.error('[distill] Unhandled error:', error);
    return errorResponse(500, getErrorMessage(error));
  }
}
