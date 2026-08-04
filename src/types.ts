export type WorkflowStatus = 'CONTINUE' | 'FINISH' | 'PAUSED';

export type SessionHistoryStatus = 'ACTIVE' | 'FINISHED' | 'ABANDONED';

export type SessionHistoryMessage = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};

export type SessionHistoryItem = {
  readonly id: string;
  readonly status: SessionHistoryStatus;
  readonly title: string;
  readonly messages: readonly SessionHistoryMessage[];
  readonly tokenUsage: LlmTokenUsage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finishedAt: string | null;
};

export type DistillRequest = {
  readonly text: string;
  readonly reset: boolean;
  readonly resume?: boolean;
};

export type LlmTokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export type DistillApiResponse =
  | {
      readonly status: 'CONTINUE';
      readonly text: string;
    }
  | {
      readonly status: 'PAUSED';
      readonly text: string;
    }
  | {
      readonly status: 'FINISH';
      readonly text: string;
      readonly tokenUsage: LlmTokenUsage;
    };

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

export type LlmDecision = LlmClarifyDecision | LlmProgressDecision | LlmFinalDecision;
