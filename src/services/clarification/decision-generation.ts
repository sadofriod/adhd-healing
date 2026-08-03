import { generateText } from 'ai';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { SYSTEM_PROMPT } from './agent';
import { createBrowserSearchTool } from './browser-search-tool';
import { buildDecisionPrompt } from './prompts';
import type { SessionMessage } from './types';

export async function generateDecisionText(sessionMessages: SessionMessage[]): Promise<string> {
  const client = getLlmClient();
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionPrompt(sessionMessages),
    tools: {
      browser_search: createBrowserSearchTool(),
    },
    toolChoice: 'auto',
    maxSteps: 5,
  });

  return result.text;
}
