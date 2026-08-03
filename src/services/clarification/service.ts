import type { LlmDecision } from '../../types';
import { classifyArchiveDocument } from './archive';
import { parseDecision } from './decision';
import { generateDecisionText } from './decision-generation';
import type { SessionMessage } from './types';

async function attachArchiveClassification(
  decision: Extract<LlmDecision, { type: 'final' }>,
  sessionMessages: SessionMessage[]
): Promise<LlmDecision> {
  const archive = await classifyArchiveDocument({
    title: decision.title,
    markdown: decision.markdown,
    sessionMessages,
  });

  return {
    ...decision,
    archive,
  };
}

export async function makeDecision(sessionMessages: SessionMessage[]): Promise<LlmDecision> {
  const rawText = await generateDecisionText(sessionMessages);
  const decision = parseDecision(rawText);

  if (decision.type !== 'final') return decision;
  return attachArchiveClassification(decision, sessionMessages);
}