import type { DistillRequestData } from '../../types.js';
import { z } from 'zod';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const optionalSessionIdSchema = z.preprocess(
  value => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  },
  z.string().uuid('session_id must be a valid UUID').optional()
);

const basePayloadSchema = z.object({
  input_mode: z.enum(['text', 'audio']),
  session_id: optionalSessionIdSchema,
  text: z.unknown().optional(),
  audio: z.unknown().optional(),
});

const textPayloadSchema = basePayloadSchema.extend({
  input_mode: z.literal('text'),
  text: z.string().trim().min(1, 'text field is required and must not be empty for text mode'),
});

const audioPayloadSchema = basePayloadSchema.extend({
  input_mode: z.literal('audio'),
  audio: z.instanceof(File, {
    message: 'audio field is required and must be a file for audio mode',
  }),
});

type TextPayload = z.infer<typeof textPayloadSchema>;
type AudioPayload = z.infer<typeof audioPayloadSchema>;

function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError(result.error.issues[0]?.message ?? 'Invalid request payload');
}

function readPayload(formData: FormData): Record<string, unknown> {
  return {
    input_mode: formData.get('input_mode'),
    session_id: formData.get('session_id'),
    text: formData.get('text') ?? undefined,
    audio: formData.get('audio') ?? undefined,
  };
}

function parsePayload(formData: FormData): TextPayload | AudioPayload {
  const payload = readPayload(formData);
  const basePayload = parseWithSchema(basePayloadSchema, payload);
  if (basePayload.input_mode === 'text') {
    return parseWithSchema(textPayloadSchema, payload);
  }
  return parseWithSchema(audioPayloadSchema, payload);
}

function buildTextRequestData(payload: TextPayload): DistillRequestData {
  return {
    inputMode: 'text',
    text: payload.text,
    sessionId: payload.session_id,
  };
}

async function buildAudioRequestData(payload: AudioPayload): Promise<DistillRequestData> {
  const audioBuffer = Buffer.from(await payload.audio.arrayBuffer());
  return {
    inputMode: 'audio',
    audioBuffer,
    sessionId: payload.session_id,
  };
}

async function toRequestData(payload: TextPayload | AudioPayload): Promise<DistillRequestData> {
  if (payload.input_mode === 'text') {
    return buildTextRequestData(payload);
  }
  return buildAudioRequestData(payload);
}

export async function validateDistillRequest(req: Request): Promise<DistillRequestData> {
  const formData = await req.formData();
  const payload = parsePayload(formData);
  return toRequestData(payload);
}
