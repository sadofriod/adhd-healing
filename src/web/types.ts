import type {
  LlmProgressPhase,
  LlmTokenUsage,
} from '../types';

export type TimelineRole = 'assistant' | 'user';

export type TimelineEntry = {
  readonly id: string;
  readonly role: TimelineRole;
  readonly content: string;
  readonly turnIndex: number;
  readonly tokenUsage?: LlmTokenUsage;
  readonly estimatedCostUsd?: number;
};

export type ConversationState = {
  readonly prompt: string;
  readonly entries: readonly TimelineEntry[];
  readonly finalText: string | null;
  readonly finalTokenUsage: LlmTokenUsage | null;
};

export type ProgressEntry =
  | {
      readonly id: string;
      readonly type: 'progress';
      readonly phase: LlmProgressPhase;
      readonly message: string;
      readonly details?: string;
      readonly operationId?: string;
      readonly input?: unknown;
      readonly output?: unknown;
    }
  | {
      readonly id: string;
      readonly type: 'usage';
      readonly source: string;
      readonly usage: LlmTokenUsage;
      readonly estimatedCostUsd: number;
    };

  export type ExecutionStatus = 'idle' | 'running' | 'paused';
