import { generateText } from 'ai';
import { z } from 'zod';
import type {
  DeepResearchArtifact,
  DeepResearchTopic,
} from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { createBrowserSearchTool } from './browser-search-tool';
import { getResearchSystemPrompt } from './research-agent';
import type { SessionMessage } from './types';

const REQUIRED_SECTIONS = [
  '# 深度调研',
  '## 执行结论',
  '## 实施步骤',
  '## 风险与验证',
] as const;

const ResearchResultSchema = z.object({
  markdown: z.string().trim().min(1),
  summary: z.string().trim().min(1).max(160),
  tags: z.array(z.string().trim().min(1).max(30)).min(2).max(8),
}).superRefine((value, context) => {
  REQUIRED_SECTIONS.forEach(section => {
    if (value.markdown.includes(section)) return;
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `markdown 缺少章节：${section}`,
      path: ['markdown'],
    });
  });
});

export type ResearchAgentInput = {
  readonly topic: DeepResearchTopic;
  readonly mainTitle: string;
  readonly mainMarkdown: string;
  readonly sessionMessages: readonly SessionMessage[];
  readonly invalidResponse?: string;
};

export type ResearchTextGenerator = (
  input: ResearchAgentInput
) => Promise<string>;

export type DeepResearchInput = {
  readonly topics: readonly DeepResearchTopic[];
  readonly mainTitle: string;
  readonly mainMarkdown: string;
  readonly sessionMessages: readonly SessionMessage[];
};

function extractJsonObject(rawText: string): string {
  const match = rawText.match(/\{[\s\S]*\}/);
  return match?.[0] ?? rawText;
}

function buildResearchPrompt(input: ResearchAgentInput): string {
  const retryInstruction = input.invalidResponse
    ? `\n上一次输出无效：${JSON.stringify(input.invalidResponse.slice(0, 500))}\n请修正后重新输出。`
    : '';

  return [
    `主报告标题：${input.mainTitle}`,
    `调研标题：${input.topic.title}`,
    `研究范围：${input.topic.scope}`,
    `直接相关性：${input.topic.relevance}`,
    `执行目标：${input.topic.executionGoal}`,
    '',
    '主报告：',
    input.mainMarkdown,
    '',
    '澄清会话（JSON）：',
    JSON.stringify(input.sessionMessages),
    '',
    '输出严格 JSON：',
    '{"markdown":"完整 Markdown","summary":"160字以内执行摘要","tags":["标签1","标签2"]}',
    retryInstruction,
  ].join('\n');
}

async function generateResearchText(input: ResearchAgentInput): Promise<string> {
  const client = getLlmClient();
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: getResearchSystemPrompt(),
    prompt: buildResearchPrompt(input),
    tools: {
      browser_search: createBrowserSearchTool(),
      ...getMcpTools(),
    },
    toolChoice: 'auto',
    maxSteps: 8,
  });

  return result.text;
}

export function parseResearchArtifact(
  title: string,
  rawText: string
): DeepResearchArtifact {
  const parsed = ResearchResultSchema.parse(
    JSON.parse(extractJsonObject(rawText))
  );
  return {
    title,
    markdown: parsed.markdown,
    summary: parsed.summary,
    tags: parsed.tags,
  };
}

export function deduplicateResearchTopics(
  topics: readonly DeepResearchTopic[]
): readonly DeepResearchTopic[] {
  const seen = new Set<string>();
  return topics.filter(topic => {
    const key = topic.title.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function researchTopic(
  input: Omit<ResearchAgentInput, 'invalidResponse'>,
  generate: ResearchTextGenerator
): Promise<DeepResearchArtifact> {
  let invalidResponse: string | undefined;

  while (true) {
    const rawText = await generate({ ...input, invalidResponse });
    try {
      return parseResearchArtifact(input.topic.title, rawText);
    } catch (error) {
      invalidResponse = getErrorMessage(error);
    }
  }
}

export async function runDeepResearch(
  input: DeepResearchInput,
  generate: ResearchTextGenerator = generateResearchText
): Promise<readonly DeepResearchArtifact[]> {
  const topics = deduplicateResearchTopics(input.topics);
  return Promise.all(topics.map(topic => researchTopic({
    topic,
    mainTitle: input.mainTitle,
    mainMarkdown: input.mainMarkdown,
    sessionMessages: input.sessionMessages,
  }, generate)));
}
