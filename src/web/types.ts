import type { DistillResponse, InputMode } from '../types.js';

export type TimelineRole = 'assistant' | 'user';

export type TimelineEntry = {
  readonly id: string;
  readonly role: TimelineRole;
  readonly mode: InputMode | 'system';
  readonly content: string;
  readonly turnIndex: number;
};

export type ConversationState = {
  readonly sessionId: string | null;
  readonly prompt: string;
  readonly entries: readonly TimelineEntry[];
  readonly finalResponse: DistillResponse | null;
};