import { useState } from 'react';
import type { DistillApiResponse, LlmProgressDecision } from '../../types';
import { readDistillStream } from '../distill-stream';
import type { ConversationState, ProgressEntry, TimelineEntry } from '../types';

type DistillSessionState = {
  readonly conversation: ConversationState;
  readonly errorMessage: string | null;
  readonly isSubmitting: boolean;
  readonly progressEntries: readonly ProgressEntry[];
  readonly resetSession: () => void;
  readonly submitText: (text: string) => Promise<void>;
};

const INITIAL_PROMPT = '先把你的想法说出来。我会逐轮追问，直到变成一份可执行的结果。';
const COMPLETED_PROMPT = '这一轮已经完成。准备好了就直接开始下一轮新的想法。';

function createTimelineEntry(
  role: 'assistant' | 'user',
  content: string,
  turnIndex: number
): TimelineEntry {
  return { id: crypto.randomUUID(), role, content, turnIndex };
}

function createInitialConversation(): ConversationState {
  return {
    prompt: INITIAL_PROMPT,
    entries: [createTimelineEntry('assistant', INITIAL_PROMPT, 0)],
    finalText: null,
  };
}

function getUserTurnIndex(entries: readonly TimelineEntry[]): number {
  return entries.filter(e => e.role === 'user').length + 1;
}

async function fetchDistill(
  text: string,
  reset: boolean,
  onProgress: (progress: LlmProgressDecision) => void
): Promise<DistillApiResponse> {
  const response = await fetch('/distill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, reset }),
  });
  return readDistillStream(response, onProgress);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '请求失败，请稍后重试。';
}

export function useDistillSession(): DistillSessionState {
  const [conversation, setConversation] = useState<ConversationState>(createInitialConversation);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [progressEntries, setProgressEntries] = useState<readonly ProgressEntry[]>([]);

  async function submitText(text: string): Promise<void> {
    const turnIndex = getUserTurnIndex(conversation.entries);
    const userEntry = createTimelineEntry('user', text, turnIndex);
    const isReset = pendingReset;

    setIsSubmitting(true);
    setErrorMessage(null);
    setPendingReset(false);
    setProgressEntries([]);

    try {
      const result = await fetchDistill(text, isReset, progress => {
        setProgressEntries(current => [
          ...current,
          {
            id: crypto.randomUUID(),
            phase: progress.phase,
            message: progress.message,
            details: progress.details,
          },
        ]);
      });
      const isComplete = result.status === 'FINISH';
      const nextPrompt = isComplete ? COMPLETED_PROMPT : result.text;
      const assistantEntry = createTimelineEntry('assistant', result.text, turnIndex);

      setConversation(current => ({
        prompt: nextPrompt,
        entries: [...current.entries, userEntry, assistantEntry],
        finalText: isComplete ? result.text : null,
      }));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetSession(): void {
    setConversation(createInitialConversation());
    setErrorMessage(null);
    setPendingReset(true);
    setProgressEntries([]);
  }

  return {
    conversation,
    errorMessage,
    isSubmitting,
    progressEntries,
    resetSession,
    submitText,
  };
}
