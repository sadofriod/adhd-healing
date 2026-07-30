import { z } from 'zod';
import type { DistillRequest } from '../../types.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const distillRequestSchema = z.object({
  text: z.string().trim().min(1, 'text must be a non-empty string'),
  reset: z.boolean().default(false),
});

function getFirstIssueMessage(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  return firstIssue?.message ?? 'Invalid request payload';
}

function parseBody(raw: unknown): DistillRequest {
  const result = distillRequestSchema.safeParse(raw);
  if (result.success) return result.data;
  throw new ValidationError(getFirstIssueMessage(result.error));
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

export async function validateDistillRequest(req: Request): Promise<DistillRequest> {
  const raw = await readJson(req);
  return parseBody(raw);
}
