import { useRef, useState } from 'react';
import type { Locale } from '../../i18n/locale';
import type {
  DistillApiResponse,
  LlmActivityEvent,
  LlmUsageEvent,
  SessionHistoryItem,
} from '../../types';
import { isRecoverableNetworkError } from '../../services/network-error';
import { addTokenUsage, EMPTY_TOKEN_USAGE } from '../../services/token-usage';
import { readDistillStream } from '../distill-stream';
import { getWebMessage } from '../i18n/messages';
import type {
  ConversationState,
  ExecutionStatus,
  ProgressEntry,
  TimelineEntry,
} from '../types';

type DistillSessionState = {
  readonly conversation: ConversationState;
  readonly errorMessage: string | null;
  readonly executionStatus: ExecutionStatus;
  readonly progressEntries: readonly ProgressEntry[];
  readonly loadSession: (session: SessionHistoryItem) => void;
  readonly resetSession: () => void;
  readonly resumeTask: () => Promise<void>;
  readonly submitText: (text: string) => Promise<void>;
};

type PendingTask = {
  readonly text: string;
  readonly userEntry: TimelineEntry;
  readonly usageEvents: LlmUsageEvent[];
};

type CompletedDistillResponse = Exclude<DistillApiResponse, { status: 'PAUSED' }>;

type TaskCallbacks = {
  readonly onActivity: (event: LlmActivityEvent) => void;
  readonly onError: (error: unknown) => void;
  readonly onPause: () => void;
  readonly onSuccess: (result: CompletedDistillResponse) => void;
};

type CompletionFields = Pick<
  ConversationState,
  'finalText' | 'finalTokenUsage' | 'prompt'
>;

function createTimelineEntry(
  role: 'assistant' | 'user',
  content: string,
  turnIndex: number,
  usageEvents: readonly LlmUsageEvent[] = []
): TimelineEntry {
  if (usageEvents.length === 0) return { id: crypto.randomUUID(), role, content, turnIndex };
  const tokenUsage = usageEvents.reduce(
    (total, event) => addTokenUsage(total, event.usage),
    EMPTY_TOKEN_USAGE
  );
  const estimatedCostUsd = usageEvents.reduce(
    (total, event) => total + event.estimatedCostUsd,
    0
  );
  return { id: crypto.randomUUID(), role, content, turnIndex, tokenUsage, estimatedCostUsd };
}

function createPendingTask(text: string, turnIndex: number): PendingTask {
  return {
    text,
    userEntry: createTimelineEntry('user', text, turnIndex),
    usageEvents: [],
  };
}

function createInitialConversation(locale: Locale): ConversationState {
  const initialPrompt = getWebMessage(locale, 'hookInitialPrompt');
  return {
    prompt: initialPrompt,
    entries: [createTimelineEntry('assistant', initialPrompt, 0)],
    finalText: null,
    finalTokenUsage: null,
  };
}

function createConversationFromHistory(session: SessionHistoryItem, locale: Locale): ConversationState {
  const initialPrompt = getWebMessage(locale, 'hookInitialPrompt');
  let turnIndex = 0;
  const entries = session.messages.map(message => {
    if (message.role === 'user') turnIndex += 1;
    return createTimelineEntry(message.role, message.content, turnIndex);
  });
  const latestAssistant = [...session.messages]
    .reverse()
    .find(message => message.role === 'assistant');
  return {
    prompt: latestAssistant?.content ?? initialPrompt,
    entries,
    finalText: null,
    finalTokenUsage: null,
  };
}

function getUserTurnIndex(entries: readonly TimelineEntry[]): number {
  return entries.filter(e => e.role === 'user').length + 1;
}

async function fetchDistill(
  text: string,
  reset: boolean,
  resume: boolean,
  locale: Locale,
  onActivity: (event: LlmActivityEvent) => void
): Promise<DistillApiResponse> {
  const response = await fetch('/distill', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Locale': locale,
    },
    body: JSON.stringify({ text, reset, resume }),
  });
  return readDistillStream(response, onActivity, locale);
}

function getErrorMessage(error: unknown, locale: Locale): string {
  if (error instanceof Error) return error.message;
  return getWebMessage(locale, 'hookRequestFailed');
}

function handleTaskError(error: unknown, callbacks: TaskCallbacks): void {
  if (isRecoverableNetworkError(error)) {
    callbacks.onPause();
    return;
  }
  callbacks.onError(error);
}

async function runTask(
  task: PendingTask,
  reset: boolean,
  resume: boolean,
  locale: Locale,
  callbacks: TaskCallbacks
): Promise<void> {
  try {
    const result = await fetchDistill(task.text, reset, resume, locale, callbacks.onActivity);
    if (result.status === 'PAUSED') {
      callbacks.onPause();
      return;
    }
    callbacks.onSuccess(result);
  } catch (error) {
    handleTaskError(error, callbacks);
  }
}

function pauseConversation(
  current: ConversationState,
  task: PendingTask,
  locale: Locale
): ConversationState {
  return {
    ...current,
    prompt: getWebMessage(locale, 'hookPausedPrompt'),
    entries: appendUserEntry(current.entries, task.userEntry),
  };
}

function completeConversation(
  current: ConversationState,
  task: PendingTask,
  result: CompletedDistillResponse,
  locale: Locale
): ConversationState {
  const assistantEntry = createTimelineEntry(
    'assistant', result.text, task.userEntry.turnIndex, task.usageEvents
  );
  return {
    ...getCompletionFields(result, locale),
    entries: appendTaskEntries(current.entries, task.userEntry, assistantEntry),
  };
}

function getCompletionFields(result: CompletedDistillResponse, locale: Locale): CompletionFields {
  if (result.status === 'FINISH') {
    return {
      prompt: getWebMessage(locale, 'hookCompletedPrompt'),
      finalText: result.text,
      finalTokenUsage: result.tokenUsage,
    };
  }
  return { prompt: result.text, finalText: null, finalTokenUsage: null };
}

function getProgressForExecution(
  current: readonly ProgressEntry[],
  resume: boolean
): readonly ProgressEntry[] {
  return resume ? current : [];
}

export function useDistillSession(locale: Locale): DistillSessionState {
  const [conversation, setConversation] = useState<ConversationState>(() => createInitialConversation(locale));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [pendingReset, setPendingReset] = useState(false);
  const [progressEntries, setProgressEntries] = useState<readonly ProgressEntry[]>([]);
  const pendingTaskRef = useRef<PendingTask | null>(null);

  async function executeTask(task: PendingTask, reset: boolean, resume: boolean): Promise<void> {
    setExecutionStatus('running');
    setErrorMessage(null);
    setPendingReset(false);
    setProgressEntries(current => getProgressForExecution(current, resume));
    await runTask(task, reset, resume, locale, {
      onActivity: event => {
        if (event.type === 'usage') task.usageEvents.push(event);
        setProgressEntries(current => [...current, { id: crypto.randomUUID(), ...event }]);
      },
      onError: error => failTask(error),
      onPause: () => pauseTask(task),
      onSuccess: result => completeTask(task, result),
    });
  }

  function pauseTask(task: PendingTask): void {
    pendingTaskRef.current = task;
    setConversation(current => pauseConversation(current, task, locale));
    setExecutionStatus('paused');
  }

  function completeTask(task: PendingTask, result: CompletedDistillResponse): void {
    setConversation(current => completeConversation(current, task, result, locale));
    pendingTaskRef.current = null;
    setExecutionStatus('idle');
  }

  function failTask(error: unknown): void {
    setErrorMessage(getErrorMessage(error, locale));
    setExecutionStatus('idle');
  }

  async function submitText(text: string): Promise<void> {
    const turnIndex = getUserTurnIndex(conversation.entries);
    const task = createPendingTask(text, turnIndex);
    await executeTask(task, pendingReset, false);
  }

  async function resumeTask(): Promise<void> {
    const task = pendingTaskRef.current;
    if (!task) return;
    await executeTask(task, false, true);
  }

  function resetSession(): void {
    setConversation(createInitialConversation(locale));
    setErrorMessage(null);
    setPendingReset(true);
    setProgressEntries([]);
    pendingTaskRef.current = null;
    setExecutionStatus('idle');
  }

  function loadSession(session: SessionHistoryItem): void {
    setConversation(createConversationFromHistory(session, locale));
    setErrorMessage(null);
    setPendingReset(false);
    setProgressEntries([]);
    pendingTaskRef.current = null;
    setExecutionStatus('idle');
  }

  return { conversation, errorMessage, executionStatus, progressEntries,
    loadSession, resetSession, resumeTask, submitText };
}

function appendUserEntry(
  entries: readonly TimelineEntry[],
  userEntry: TimelineEntry
): readonly TimelineEntry[] {
  if (entries.some(entry => entry.id === userEntry.id)) return entries;
  return [...entries, userEntry];
}

function appendTaskEntries(
  entries: readonly TimelineEntry[],
  userEntry: TimelineEntry,
  assistantEntry: TimelineEntry
): readonly TimelineEntry[] {
  return [...appendUserEntry(entries, userEntry), assistantEntry];
}
