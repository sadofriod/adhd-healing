import { z } from 'zod';
import type { Locale } from '../../i18n/locale';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { getServerMessage } from '../../i18n/server-messages';
import type { DistillRequest } from '../../types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function createDistillRequestSchema(locale: Locale) {
  return z.object({
    text: z.string().trim().min(1, getServerMessage(locale, 'distillTextRequired')),
    reset: z.boolean().default(false),
    resume: z.boolean().default(false),
  });
}

function getFirstIssueMessage(error: z.ZodError, locale: Locale): string {
  const firstIssue = error.issues[0];
  return firstIssue?.message ?? getServerMessage(locale, 'invalidRequestPayload');
}

function parseBody(raw: unknown, locale: Locale): DistillRequest {
  const result = createDistillRequestSchema(locale).safeParse(raw);
  if (result.success) return result.data;
  throw new ValidationError(getFirstIssueMessage(result.error, locale));
}

async function readJson(req: Request, locale: Locale): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ValidationError(getServerMessage(locale, 'invalidRequestJson'));
  }
}

export async function validateDistillRequest(
  req: Request,
  locale: Locale = DEFAULT_LOCALE
): Promise<DistillRequest> {
  const raw = await readJson(req, locale);
  return parseBody(raw, locale);
}
