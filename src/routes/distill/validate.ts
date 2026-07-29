import type { DistillRequestData } from '../../types.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function assertInputMode(mode: FormDataEntryValue | null): asserts mode is 'audio' | 'text' {
  if (mode !== 'text' && mode !== 'audio') {
    throw new ValidationError('input_mode must be "text" or "audio"');
  }
}

function isValidText(val: FormDataEntryValue | null): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function parseSessionId(formData: FormData): string | undefined {
  const raw = formData.get('session_id');
  return typeof raw === 'string' ? raw : undefined;
}

function parseTextInput(formData: FormData, sessionId?: string): DistillRequestData {
  const text = formData.get('text');
  if (!isValidText(text)) {
    throw new ValidationError('text field is required and must not be empty for text mode');
  }
  return { inputMode: 'text', text: text.trim(), sessionId };
}

async function parseAudioInput(formData: FormData, sessionId?: string): Promise<DistillRequestData> {
  const audioFile = formData.get('audio');
  if (!(audioFile instanceof File)) {
    throw new ValidationError('audio field is required and must be a file for audio mode');
  }
  const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
  return { inputMode: 'audio', audioBuffer, sessionId };
}

async function parseFormData(
  formData: FormData,
  inputMode: 'audio' | 'text'
): Promise<DistillRequestData> {
  const sessionId = parseSessionId(formData);
  if (inputMode === 'text') return parseTextInput(formData, sessionId);
  return parseAudioInput(formData, sessionId);
}

export async function validateDistillRequest(req: Request): Promise<DistillRequestData> {
  const formData = await req.formData();
  const inputMode = formData.get('input_mode');
  assertInputMode(inputMode);
  return parseFormData(formData, inputMode);
}
