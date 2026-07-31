import { generateText } from 'ai';
import type { LlmDecision } from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { SYSTEM_PROMPT } from './agent';
import { classifyArchiveDocument } from './archive';
import { createBrowserSearchTool } from './browser-search-tool';
import { parseDecision } from './decision';
import { buildDecisionPrompt } from './prompts';
import type { SessionMessage } from './types';

async function generateDecisionText(sessionMessages: SessionMessage[]): Promise<string> {
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

export async function makeDecision(sessionMessages: SessionMessage[]): Promise<LlmDecision> {
  const rawText = await generateDecisionText(sessionMessages);
  const decision = parseDecision(rawText);

  if (decision.type !== 'final') return decision;

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