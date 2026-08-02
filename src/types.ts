export type WorkflowStatus = 'CONTINUE' | 'FINISH';

export type DistillRequest = {
  readonly text: string;
  readonly reset: boolean;
};

export type DistillApiResponse = {
  readonly status: WorkflowStatus;
  readonly text: string;
};

export type DistillStreamEvent =
  | LlmProgressDecision
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
};

export type LlmProgressReporter = (progress: LlmProgressDecision) => void;

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

export type LlmDecision = LlmClarifyDecision | LlmFinalDecision;
