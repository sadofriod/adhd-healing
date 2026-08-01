import { generateText } from 'ai';
import type { LlmDecision } from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { SYSTEM_PROMPT } from './agent';
import { classifyArchiveDocument } from './archive';
import { createBrowserSearchTool } from './browser-search-tool';
import { parseDecision } from './decision';
import { buildDecisionPrompt } from './prompts';
import type { SessionMessage } from './types';

const MAX_DECISION_ATTEMPTS = 3;

async function generateDecisionText(
  sessionMessages: SessionMessage[],
  invalidResponse?: string
): Promise<string> {
  const client = getLlmClient();
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionPrompt(sessionMessages, invalidResponse),
    tools: {
      browser_search: createBrowserSearchTool(),
      ...getMcpTools(),
    },
    toolChoice: 'auto',
    maxSteps: 5,
  });

  return result.text;
}

async function addArchiveToFinalDecision(
  decision: LlmDecision,
  sessionMessages: SessionMessage[]
): Promise<LlmDecision> {
  if (decision.type !== 'final') return decision;

  const archive = await classifyArchiveDocument({
    title: decision.title,
    markdown: decision.markdown,
    sessionMessages,
  });

  return { ...decision, archive };
}

export async function makeDecision(sessionMessages: SessionMessage[]): Promise<LlmDecision> {
  let invalidResponse: string | undefined;

  for (let attempt = 0; attempt < MAX_DECISION_ATTEMPTS; attempt += 1) {
    const rawText = await generateDecisionText(sessionMessages, invalidResponse);
    const decision = parseDecision(rawText);

    if (decision.type === 'retry') {
      invalidResponse = decision.message;
      continue;
    }

    return addArchiveToFinalDecision(decision, sessionMessages);
  }

  throw new Error('LLM 连续返回陈述或过程说明，未生成有效的追问或最终报告');
}