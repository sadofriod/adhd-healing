export type InputMode = 'audio' | 'text';
export type SessionStatus = 'clarifying' | 'completed' | 'abandoned';
export type MessageRole = 'user' | 'assistant';
export type ResponseType = 'clarify' | 'final';

export interface Session {
  id: string;
  status: SessionStatus;
  turn_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface SessionMessage {
  id: number;
  session_id: string;
  role: MessageRole;
  input_mode: InputMode | 'system';
  content: string;
  created_at: Date;
}

export interface TextRequestData {
  inputMode: 'text';
  text: string;
  sessionId?: string;
}

export interface AudioRequestData {
  inputMode: 'audio';
  audioBuffer: Buffer;
  sessionId?: string;
}

export type DistillRequestData = TextRequestData | AudioRequestData;

export interface DistillResponse {
  session_id: string;
  response_type: ResponseType;
  assistant_message: string;
  turn_index: number;
  is_complete: boolean;
  final_markdown: string | null;
  final_title: string | null;
  milestone: string | null;
}

export interface LlmClarifyDecision {
  type: 'clarify';
  message: string;
}

export interface LlmFinalDecision {
  type: 'final';
  message: string;
  markdown: string;
}

export type LlmDecision = LlmClarifyDecision | LlmFinalDecision;

export interface IdeaRow {
  id: number;
  raw_text: string;
  distilled_text: string;
  created_at: Date;
}
