import type {
  LlmDecision,
  LlmFinalDecision,
  LlmFinalDecisionDraft,
  LlmActivityReporter,
} from '../../types';
import { classifyArchiveDocument } from './archive';
import { parseDecision } from './decision';
import { generateDecisionText } from './decision-generation';
import type { SessionMessage } from './types';

const ignoreActivity: LlmActivityReporter = () => undefined;

async function attachArchiveClassification(
  decision: LlmFinalDecisionDraft,
  sessionMessages: SessionMessage[]
): Promise<LlmFinalDecision> {
  const archive = await classifyArchiveDocument({
    title: decision.title,
    markdown: decision.markdown,
    sessionMessages,
  });

  return {
    ...decision,
    archive,
    researchArtifacts: [],
  };
}

export async function makeDecision(
  sessionMessages: SessionMessage[],
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<LlmDecision> {
  const rawText = await generateDecisionText(sessionMessages, reportActivity);
  const decision = parseDecision(rawText);

  if (decision.type !== 'final') return decision;
  return attachArchiveClassification(decision, sessionMessages);
}