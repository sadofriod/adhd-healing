import type { LlmDecision } from '../../types.js';

type FinalizeWritePipeline = Readonly<{
  writeToVault: () => Promise<void>;
  writeIdeaRecord: () => Promise<void>;
  syncReminder: () => Promise<void>;
  commitSessionCompletion: () => Promise<void>;
}>;

export function getAssistantRecordContent(decision: LlmDecision): string {
  if (decision.type === 'final') return decision.markdown;
  return decision.message;
}

export function getResponseTurnIndex(turnCount: number, decision: LlmDecision): number {
  if (decision.type === 'final') return turnCount;
  return turnCount + 1;
}

export async function runFinalizeWritePipeline(
  pipeline: FinalizeWritePipeline
): Promise<void> {
  await pipeline.writeToVault();
  await pipeline.writeIdeaRecord();
  await pipeline.syncReminder();
  await pipeline.commitSessionCompletion();
}