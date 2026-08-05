import type { Locale } from './i18n/locale';

export type WorkflowStatus = 'CONTINUE' | 'FINISH' | 'PAUSED';

export type SessionHistoryStatus = 'ACTIVE' | 'FINISHED' | 'ABANDONED';

export type SessionHistoryMessage = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};

export type PendingSessionTurn = {
  readonly text: string;
  readonly attachments: readonly DistillAttachment[];
};

export type SessionHistoryItem = {
  readonly id: string;
  readonly status: SessionHistoryStatus;
  readonly title: string;
  readonly messages: readonly SessionHistoryMessage[];
  readonly activityEntries: readonly LlmActivityEvent[];
  readonly pendingTurnInput: string | null;
  readonly pendingTurn: PendingSessionTurn | null;
  readonly tokenUsage: LlmTokenUsage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
};

export type DistillRequest = {
  readonly text: string;
  readonly reset: boolean;
  readonly resume?: boolean;
  readonly sessionId?: string;
  readonly attachments?: readonly DistillAttachment[];
  readonly locale?: Locale;
};

export type DistillAttachment = {
  readonly name: string;
  readonly content: string;
  readonly mimeType?: string;
  readonly size: number;
};

export type LlmTokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

type DistillApiResponseBase = {
  readonly status: WorkflowStatus;
  readonly text: string;
  readonly sessionId: string;
};

export type DistillApiResponse =
  | (DistillApiResponseBase & {
      readonly status: 'CONTINUE';
    })
  | (DistillApiResponseBase & {
      readonly status: 'PAUSED';
    })
  | (DistillApiResponseBase & {
      readonly status: 'FINISH';
      readonly tokenUsage: LlmTokenUsage;
    });

export type DistillStreamEvent =
  | LlmProgressDecision
  | LlmUsageEvent
  | {
      readonly type: 'result';
      readonly result: DistillApiResponse;
    }
  | {
      readonly type: 'error';
      readonly error: string;
    };

export type ArchiveClassification = {
  readonly category: string;
  readonly subcategory: string;
  readonly summary: string;
  readonly tags: readonly string[];
};

export type DeepResearchTopic = {
  readonly title: string;
  readonly scope: string;
  readonly relevance: string;
  readonly executionGoal: string;
};

export type DeepResearchArtifact = {
  readonly title: string;
  readonly markdown: string;
  readonly summary: string;
  readonly tags: readonly string[];
};

export type LlmClarifyDecision = {
  readonly type: 'clarify';
  readonly message: string;
};

export type LlmNoteDecision = {
  readonly type: 'note';
  readonly message: string;
};

export type LlmProgressPhase = 'process' | 'tool-call' | 'sub-agent';

export type LlmProgressDecision = {
  readonly type: 'progress';
  readonly phase: LlmProgressPhase;
  readonly message: string;
  readonly details?: string;
  readonly operationId?: string;
  readonly input?: unknown;
  readonly output?: unknown;
};

export type LlmUsageEvent = {
  readonly type: 'usage';
  readonly source: string;
  readonly usage: LlmTokenUsage;
  readonly estimatedCostUsd: number;
};

export type LlmActivityEvent = LlmProgressDecision | LlmUsageEvent;

export type LlmActivityReporter = (event: LlmActivityEvent) => void;

export type LlmFinalDecisionDraft = {
  readonly type: 'final';
  readonly message: string;
  readonly markdown: string;
  readonly milestone: string;
  readonly title: string;
  readonly researchTopics: readonly DeepResearchTopic[];
};

export type LlmFinalDecision = LlmFinalDecisionDraft & {
  readonly archive: ArchiveClassification;
  readonly researchArtifacts: readonly DeepResearchArtifact[];
};

export type LlmDecision = LlmClarifyDecision | LlmNoteDecision | LlmProgressDecision | LlmFinalDecision;
