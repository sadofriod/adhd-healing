export type WorkflowStatus = 'CONTINUE' | 'FINISH';

export interface DistillRequest {
  text: string;
  reset: boolean;
}

export interface DistillApiResponse {
  status: WorkflowStatus;
  text: string;
}

export interface ArchiveClassification {
  category: string;
  subcategory: string;
  summary: string;
  tags: string[];
}

export interface LlmClarifyDecision {
  type: 'clarify';
  message: string;
}

export interface LlmFinalDecision {
  type: 'final';
  message: string;
  markdown: string;
  milestone: string;
  title: string;
  archive: ArchiveClassification;
}

export type LlmDecision = LlmClarifyDecision | LlmFinalDecision;
