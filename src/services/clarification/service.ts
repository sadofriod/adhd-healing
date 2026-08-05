import type {
  LlmDecision,
  LlmFinalDecision,
  LlmFinalDecisionDraft,
  LlmActivityReporter,
} from '../../types';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale';
import { classifyArchiveDocument } from './archive';
import { parseDecision } from './decision';
import { generateDecisionText } from './decision-generation';
import type { SessionMessage } from './types';

const ignoreActivity: LlmActivityReporter = () => undefined;

async function attachArchiveClassification(
  decision: LlmFinalDecisionDraft,
  sessionMessages: SessionMessage[],
  locale: Locale
): Promise<LlmFinalDecision> {
  const archive = await classifyArchiveDocument({
    title: decision.title,
    markdown: decision.markdown,
    sessionMessages,
    locale,
  });

  return {
    ...decision,
    archive,
    researchArtifacts: [],
  };
}

export async function makeDecision(
  sessionMessages: SessionMessage[],
  locale: Locale = DEFAULT_LOCALE,
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<LlmDecision> {
  const rawText = await generateDecisionText(sessionMessages, locale, reportActivity);
  const decision = parseDecision(rawText);

  if (decision.type !== 'final') return decision;
  return attachArchiveClassification(decision, sessionMessages, locale);
}