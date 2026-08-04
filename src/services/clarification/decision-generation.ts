import { generateText } from 'ai';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { reportTokenUsages } from '../token-usage';
import { SYSTEM_PROMPT } from './agent';
import { createBrowserSearchTool } from './browser-search-tool';
import { buildDecisionPrompt } from './prompts';
import { collectToolActivities } from './tool-usage';
import type { LlmActivityReporter } from '../../types';
import type { SessionMessage } from './types';

const ignoreActivity: LlmActivityReporter = () => undefined;

export async function generateDecisionText(
  sessionMessages: SessionMessage[],
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<string> {
  const client = getLlmClient();
  const mcpTools = getMcpTools();
  const mcpToolNames = new Set(Object.keys(mcpTools));
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionPrompt(sessionMessages),
    tools: {
      browser_search: createBrowserSearchTool(),
      ...mcpTools,
    },
    toolChoice: 'auto',
    maxSteps: 5,
    onStepFinish: async step => {
      collectToolActivities([step], mcpToolNames).forEach(activity => reportActivity({
        type: 'progress',
        phase: 'tool-call',
        message: `澄清决策：${activity.toolName}`,
        operationId: activity.operationId,
        input: activity.input,
        ...(activity.output === undefined ? {} : { output: activity.output }),
      }));
    },
  });

  reportTokenUsages('澄清决策', result.steps.map(step => step.usage), reportActivity);

  return result.text;
}
