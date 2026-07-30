import { useState } from 'react';
import type { DistillResponse, InputMode } from '../../types.js';
import type { ConversationState, TimelineEntry } from '../types.js';

type SubmitAudioFn = (blob: Blob, fileName: string) => Promise<void>;
type SubmitTextFn = (text: string) => Promise<void>;

type SubmitPayload =
  | {
      readonly inputMode: 'text';
      readonly text: string;
    }
  | {
      readonly inputMode: 'audio';
      readonly blob: Blob;
      readonly fileName: string;
    };

type DistillSessionState = {
  readonly conversation: ConversationState;
  readonly errorMessage: string | null;
  readonly isSubmitting: boolean;
  readonly resetSession: () => void;
  readonly submitAudio: SubmitAudioFn;
  readonly submitText: SubmitTextFn;
};

const INITIAL_PROMPT = '先把你的想法说出来。我会逐轮追问，直到变成一份可执行的结果。';
const COMPLETED_PROMPT = '这一轮已经完成。准备好了就直接开始下一轮新的想法。';

function createTimelineEntry(
  role: 'assistant' | 'user',
  mode: InputMode | 'system',
  content: string,
  turnIndex: number
): TimelineEntry {
  return {
    id: crypto.randomUUID(),
    role,
    mode,
    content,
    turnIndex,
  };
}

function createInitialConversation(): ConversationState {
  return {
    sessionId: null,
    prompt: INITIAL_PROMPT,
    entries: [createTimelineEntry('assistant', 'system', INITIAL_PROMPT, 0)],
    finalResponse: null,
  };
}

function getUserTurnIndex(entries: readonly TimelineEntry[]): number {
  return entries.filter(entry => entry.role === 'user').length + 1;
}

function buildTextRequest(text: string, sessionId: string | null): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input_mode: 'text',
      text,
      session_id: sessionId,
    }),
  };
}

function buildAudioRequest(blob: Blob, fileName: string, sessionId: string | null): RequestInit {
  const formData = new FormData();
  formData.set('input_mode', 'audio');
  formData.set('audio', new File([blob], fileName, { type: blob.type || 'audio/webm' }));

  if (sessionId) {
    formData.set('session_id', sessionId);
  }

  return {
    method: 'POST',
    body: formData,
  };
}

function getJsonErrorMessage(payload: unknown): string | null {
  const payloadRecord = toPayloadRecord(payload);
  if (!payloadRecord) return null;

  const errorValue = payloadRecord.error;
  return typeof errorValue === 'string' ? errorValue : null;
}

function isPayloadRecord(payload: unknown): payload is Record<string, unknown> {
  return Boolean(payload) && typeof payload === 'object' && !Array.isArray(payload);
}

function toPayloadRecord(payload: unknown): Record<string, unknown> | null {
  return isPayloadRecord(payload) ? payload : null;
}

async function parseDistillResponse(response: Response): Promise<DistillResponse> {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    throw new Error(getJsonErrorMessage(payload) ?? '请求失败，请检查服务端日志。');
  }

  return payload as DistillResponse;
}

function buildUserEntry(payload: SubmitPayload, turnIndex: number): TimelineEntry {
  if (payload.inputMode === 'text') {
    return createTimelineEntry('user', 'text', payload.text, turnIndex);
  }

  return createTimelineEntry('user', 'audio', `上传了一段录音：${payload.fileName}`, turnIndex);
}

function buildConversationState(
  conversation: ConversationState,
  userEntry: TimelineEntry,
  response: DistillResponse
): ConversationState {
  const nextPrompt = response.is_complete ? COMPLETED_PROMPT : response.assistant_message;
  const assistantEntry = createTimelineEntry(
    'assistant',
    'system',
    response.assistant_message,
    response.turn_index
  );

  return {
    sessionId: response.session_id,
    prompt: nextPrompt,
    entries: [...conversation.entries, userEntry, assistantEntry],
    finalResponse: response.is_complete ? response : null,
  };
}

function getSubmitRequest(payload: SubmitPayload, sessionId: string | null): RequestInit {
  if (payload.inputMode === 'text') {
    return buildTextRequest(payload.text, sessionId);
  }

  return buildAudioRequest(payload.blob, payload.fileName, sessionId);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '请求失败，请稍后重试。';
}

export function useDistillSession(): DistillSessionState {
  const [conversation, setConversation] = useState<ConversationState>(createInitialConversation);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitTurn(payload: SubmitPayload): Promise<void> {
    const turnIndex = getUserTurnIndex(conversation.entries);
    const userEntry = buildUserEntry(payload, turnIndex);

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/distill', getSubmitRequest(payload, conversation.sessionId));
      const distillResponse = await parseDistillResponse(response);
      setConversation(current => buildConversationState(current, userEntry, distillResponse));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitText(text: string): Promise<void> {
    await submitTurn({ inputMode: 'text', text });
  }

  async function submitAudio(blob: Blob, fileName: string): Promise<void> {
    await submitTurn({ inputMode: 'audio', blob, fileName });
  }

  function resetSession(): void {
    setConversation(createInitialConversation());
    setErrorMessage(null);
  }

  return {
    conversation,
    errorMessage,
    isSubmitting,
    resetSession,
    submitAudio,
    submitText,
  };
}