import { useRef, useState } from 'react';
import type { Locale } from '../../i18n/locale';
import type {
  DistillApiResponse,
  DistillAttachment,
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
  readonly composerDraft: ComposerDraft | null;
  readonly conversation: ConversationState;
  readonly errorMessage: string | null;
  readonly executionStatus: ExecutionStatus;
  readonly progressEntries: readonly ProgressEntry[];
  readonly loadSession: (session: SessionHistoryItem) => void;
  readonly resetSession: () => void;
  readonly resumeTask: () => Promise<void>;
  readonly submitText: (text: string, attachments?: readonly DistillAttachment[]) => Promise<void>;
};

type PendingTask = {
  readonly text: string;
  readonly attachments: readonly DistillAttachment[];
  readonly userEntry: TimelineEntry;
  readonly usageEvents: LlmUsageEvent[];
};

type ComposerDraft = {
  readonly text: string;
  readonly attachments: readonly DistillAttachment[];
};

type CompletedDistillResponse = Exclude<DistillApiResponse, { status: 'PAUSED' }>;

type TaskCallbacks = {
  readonly onActivity: (event: LlmActivityEvent) => void;
  readonly onError: (error: unknown) => void;
  readonly onPause: (sessionId?: string) => void;
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

function buildUserEntryContent(text: string, attachments: readonly DistillAttachment[]): string {
  if (attachments.length === 0) return text;

  const attachmentSummary = attachments
    .map(attachment => `- ${attachment.name} (${attachment.size.toLocaleString()} bytes)`)
    .join('\n');

  return `${text}\n\n已附加文件：\n${attachmentSummary}`;
}

function createPendingTask(
  text: string,
  attachments: readonly DistillAttachment[],
  turnIndex: number
): PendingTask {
  return {
    text,
    attachments,
    userEntry: createTimelineEntry('user', buildUserEntryContent(text, attachments), turnIndex),
    usageEvents: [],
  };
}

function toComposerDraft(task: PendingTask): ComposerDraft {
  return {
    text: task.text,
    attachments: task.attachments,
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

function createProgressEntries(
  activityEntries: readonly LlmActivityEvent[]
): readonly ProgressEntry[] {
  return activityEntries.map(event => ({ id: crypto.randomUUID(), ...event }));
}

function getPendingTurnInput(session: SessionHistoryItem): string | null {
  return session.pendingTurn?.text ?? session.pendingTurnInput;
}

function getPendingTurnAttachments(session: SessionHistoryItem): readonly DistillAttachment[] {
  return session.pendingTurn?.attachments ?? [];
}

function createPendingTaskFromHistory(
  session: SessionHistoryItem,
  conversation: ConversationState
): PendingTask | null {
  const pendingTurnInput = getPendingTurnInput(session);
  if (!pendingTurnInput) return null;

  const restoredEntry = conversation.entries.at(-1);
  if (restoredEntry?.role !== 'user') return null;

  return {
    text: pendingTurnInput,
    attachments: getPendingTurnAttachments(session),
    userEntry: restoredEntry,
    usageEvents: [],
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
    prompt: getPendingTurnInput(session)
      ? getWebMessage(locale, 'hookPausedPrompt')
      : (latestAssistant?.content ?? initialPrompt),
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
  sessionId: string | null,
  locale: Locale,
  onActivity: (event: LlmActivityEvent) => void,
  attachments: readonly DistillAttachment[] = []
): Promise<DistillApiResponse> {
  const response = await fetch('/distill', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Locale': locale,
    },
    body: JSON.stringify({
      text,
      reset,
      resume,
      sessionId: sessionId ?? undefined,
      attachments,
      locale,
    }),
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
  sessionId: string | null,
  locale: Locale,
  callbacks: TaskCallbacks
): Promise<void> {
  try {
    const result = await fetchDistill(
      task.text,
      reset,
      resume,
      sessionId,
      locale,
      callbacks.onActivity,
      task.attachments
    );
    if (result.status === 'PAUSED') {
      callbacks.onPause(result.sessionId);
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

// eslint-disable-next-line max-lines-per-function
export function useDistillSession(locale: Locale): DistillSessionState {
  const [composerDraft, setComposerDraft] = useState<ComposerDraft | null>(null);
  const [conversation, setConversation] = useState<ConversationState>(() => createInitialConversation(locale));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [pendingReset, setPendingReset] = useState(false);
  const [progressEntries, setProgressEntries] = useState<readonly ProgressEntry[]>([]);
  const pendingTaskRef = useRef<PendingTask | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  async function executeTask(task: PendingTask, reset: boolean, resume: boolean): Promise<void> {
    setExecutionStatus('running');
    setErrorMessage(null);
    setPendingReset(false);
    await runTask(task, reset, resume, sessionIdRef.current, locale, {
      onActivity: event => {
        if (event.type === 'usage') task.usageEvents.push(event);
        setProgressEntries(current => [...current, { id: crypto.randomUUID(), ...event }]);
      },
      onError: error => failTask(error),
      onPause: pausedSessionId => pauseTask(task, pausedSessionId),
      onSuccess: result => completeTask(task, result),
    });
  }

  function pauseTask(task: PendingTask, sessionId?: string): void {
    if (sessionId) sessionIdRef.current = sessionId;
    pendingTaskRef.current = task;
    setComposerDraft(toComposerDraft(task));
    setConversation(current => pauseConversation(current, task, locale));
    setExecutionStatus('paused');
  }

  function completeTask(task: PendingTask, result: CompletedDistillResponse): void {
    sessionIdRef.current = result.sessionId;
    setComposerDraft(null);
    setConversation(current => completeConversation(current, task, result, locale));
    pendingTaskRef.current = null;
    setExecutionStatus('idle');
  }

  function failTask(error: unknown): void {
    setComposerDraft(null);
    setErrorMessage(getErrorMessage(error, locale));
    setExecutionStatus('idle');
  }

  async function submitText(text: string, attachments: readonly DistillAttachment[] = []): Promise<void> {
    const turnIndex = getUserTurnIndex(conversation.entries);
    const task = createPendingTask(text, attachments, turnIndex);
    await executeTask(task, pendingReset, false);
  }

  async function resumeTask(): Promise<void> {
    const task = pendingTaskRef.current;
    if (!task) return;
    await executeTask(task, false, true);
  }

  function resetSession(): void {
    setComposerDraft(null);
    setConversation(createInitialConversation(locale));
    setErrorMessage(null);
    setPendingReset(true);
    setProgressEntries([]);
    pendingTaskRef.current = null;
    sessionIdRef.current = null;
    setExecutionStatus('idle');
  }

  function loadSession(session: SessionHistoryItem): void {
    const restoredConversation = createConversationFromHistory(session, locale);
    const restoredPendingTask = createPendingTaskFromHistory(session, restoredConversation);
    sessionIdRef.current = session.id;
    setComposerDraft(restoredPendingTask ? toComposerDraft(restoredPendingTask) : null);
    setConversation(restoredConversation);
    setErrorMessage(null);
    setPendingReset(false);
    setProgressEntries(createProgressEntries(session.activityEntries));
    pendingTaskRef.current = restoredPendingTask;
    setExecutionStatus(restoredPendingTask ? 'paused' : 'idle');
  }

  return { composerDraft, conversation, errorMessage, executionStatus, progressEntries,
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
