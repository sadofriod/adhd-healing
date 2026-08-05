import { generateText } from 'ai';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { getSessionResearchMemory } from '../session';
import { rememberCompressedSessionResearch } from '../session-memory';
import { reportTokenUsages } from '../token-usage';
import { SYSTEM_PROMPT } from './agent';
import { buildDecisionPrompt } from './prompts';
import { collectToolActivities, type ToolActivity } from './tool-usage';
import type { LlmActivityReporter, LlmProgressDecision } from '../../types';
import type { SessionMessage } from './types';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale';

const ignoreActivity: LlmActivityReporter = () => undefined;

export function buildDecisionAgentPrompt(
  sessionMessages: SessionMessage[],
  progress: LlmProgressDecision | undefined,
  locale: Locale = DEFAULT_LOCALE
): string {
  return buildDecisionPrompt(
    sessionMessages,
    progress,
    getSessionResearchMemory(),
    locale
  );
}

function getDecisionToolCallMessage(locale: Locale, toolName: string): string {
  if (locale === 'en') return `Decision step: ${toolName}`;
  return `澄清决策：${toolName}`;
}

function getDecisionUsageSource(locale: Locale): string {
  if (locale === 'en') return 'Decision generation';
  return '澄清决策';
}

export async function recordDecisionToolActivities(
  activities: readonly ToolActivity[],
  locale: Locale,
  reportActivity: LlmActivityReporter
): Promise<void> {
  await Promise.all(activities.map(async activity => {
    if (activity.output !== undefined) {
      await rememberCompressedSessionResearch({
        toolName: activity.toolName,
        input: activity.input,
        output: activity.output,
      }, reportActivity);
    }
    reportActivity({
      type: 'progress',
      phase: 'tool-call',
      message: getDecisionToolCallMessage(locale, activity.toolName),
      operationId: activity.operationId,
      input: activity.input,
      ...(activity.output === undefined ? {} : { output: activity.output }),
    });
  }));
}

export async function generateDecisionText(
  sessionMessages: SessionMessage[],
  progress: LlmProgressDecision | undefined,
  locale: Locale = DEFAULT_LOCALE,
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<string> {
  const client = getLlmClient();
  const mcpTools = getMcpTools();
  const mcpToolNames = new Set(Object.keys(mcpTools));
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionAgentPrompt(sessionMessages, progress, locale),
    tools: {
      ...mcpTools,
    },
    toolChoice: 'auto',
    maxSteps: 5,
    onStepFinish: async step => {
      const activities = collectToolActivities([step], mcpToolNames);
      await recordDecisionToolActivities(activities, locale, reportActivity);
    },
  });

  reportTokenUsages(getDecisionUsageSource(locale), result.steps.map(step => step.usage), reportActivity);

  return result.text;
}
