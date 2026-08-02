import type { LlmProgressPhase } from '../types';

export type TimelineRole = 'assistant' | 'user';

export type TimelineEntry = {
  readonly id: string;
  readonly role: TimelineRole;
  readonly content: string;
  readonly turnIndex: number;
};

export type ConversationState = {
  readonly prompt: string;
  readonly entries: readonly TimelineEntry[];
  readonly finalText: string | null;
};

export type ProgressEntry = {
  readonly id: string;
  readonly phase: LlmProgressPhase;
  readonly message: string;
  readonly details?: string;
};
