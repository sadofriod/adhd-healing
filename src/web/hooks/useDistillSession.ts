import { useRef, useState } from 'react';
import type {
  DistillApiResponse,
  LlmActivityEvent,
  LlmUsageEvent,
  SessionHistoryItem,
} from '../../types';
import { isRecoverableNetworkError } from '../../services/network-error';
import { addTokenUsage, EMPTY_TOKEN_USAGE } from '../../services/token-usage';
import { readDistillStream } from '../distill-stream';
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

const INITIAL_PROMPT = '先把你的想法说出来。我会逐轮追问，直到变成一份可执行的结果。';
const COMPLETED_PROMPT = '这一轮已经完成。准备好了就直接开始下一轮新的想法。';

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

function createInitialConversation(): ConversationState {
  return {
    prompt: INITIAL_PROMPT,
    entries: [createTimelineEntry('assistant', INITIAL_PROMPT, 0)],
    finalText: null,
    finalTokenUsage: null,
  };
}

function createConversationFromHistory(session: SessionHistoryItem): ConversationState {
  let turnIndex = 0;
  const entries = session.messages.map(message => {
    if (message.role === 'user') turnIndex += 1;
    return createTimelineEntry(message.role, message.content, turnIndex);
  });
  const latestAssistant = [...session.messages]
    .reverse()
    .find(message => message.role === 'assistant');
  return {
    prompt: latestAssistant?.content ?? INITIAL_PROMPT,
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
  onActivity: (event: LlmActivityEvent) => void
): Promise<DistillApiResponse> {
  const response = await fetch('/distill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, reset, resume }),
  });
  return readDistillStream(response, onActivity);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '请求失败，请稍后重试。';
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
  callbacks: TaskCallbacks
): Promise<void> {
  try {
    const result = await fetchDistill(task.text, reset, resume, callbacks.onActivity);
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
  task: PendingTask
): ConversationState {
  return {
    ...current,
    prompt: '网络连接中断，任务已暂停。连接恢复后可继续执行。',
    entries: appendUserEntry(current.entries, task.userEntry),
  };
}

function completeConversation(
  current: ConversationState,
  task: PendingTask,
  result: CompletedDistillResponse
): ConversationState {
  const assistantEntry = createTimelineEntry(
    'assistant', result.text, task.userEntry.turnIndex, task.usageEvents
  );
  return {
    ...getCompletionFields(result),
    entries: appendTaskEntries(current.entries, task.userEntry, assistantEntry),
  };
}

function getCompletionFields(result: CompletedDistillResponse): CompletionFields {
  if (result.status === 'FINISH') {
    return {
      prompt: COMPLETED_PROMPT,
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

export function useDistillSession(): DistillSessionState {
  const [conversation, setConversation] = useState<ConversationState>(createInitialConversation);
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
    await runTask(task, reset, resume, {
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
    setConversation(current => pauseConversation(current, task));
    setExecutionStatus('paused');
  }

  function completeTask(task: PendingTask, result: CompletedDistillResponse): void {
    setConversation(current => completeConversation(current, task, result));
    pendingTaskRef.current = null;
    setExecutionStatus('idle');
  }

  function failTask(error: unknown): void {
    setErrorMessage(getErrorMessage(error));
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
    setConversation(createInitialConversation());
    setErrorMessage(null);
    setPendingReset(true);
    setProgressEntries([]);
    pendingTaskRef.current = null;
    setExecutionStatus('idle');
  }

  function loadSession(session: SessionHistoryItem): void {
    setConversation(createConversationFromHistory(session));
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
