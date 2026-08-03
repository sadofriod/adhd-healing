import { generateText } from 'ai';
import { z } from 'zod';
import type {
  DeepResearchArtifact,
  DeepResearchTopic,
  LlmActivityReporter,
} from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { reportTokenUsages } from '../token-usage';
import { getSessionResearchMemory, rememberSessionResearch } from '../session';
import { createBrowserSearchTool } from './browser-search-tool';
import { buildMemoryInstruction } from './prompts';
import { getResearchSystemPrompt } from './research-agent';
import { collectToolActivities } from './tool-usage';
import type { SessionMessage } from './types';

const REQUIRED_SECTIONS = [
  '# 深度调研',
  '## 执行结论',
  '## 实施步骤',
  '## 风险与验证',
] as const;
const ignoreActivity: LlmActivityReporter = () => undefined;

const ResearchResultSchema = z.object({
  markdown: z.string().trim().min(1),
  summary: z.string().trim().min(1),
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
  input: ResearchAgentInput,
  reportActivity?: LlmActivityReporter
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

function parseJsonResearchResult(rawText: string): unknown | undefined {
  try {
    return JSON.parse(extractJsonObject(rawText)) as unknown;
  } catch {
    return undefined;
  }
}

function summarizePlainText(rawText: string, title: string): string {
  const firstContentLine = rawText
    .split('\n')
    .map(line => line.replace(/^#+\s*/, '').trim())
    .find(Boolean);
  return firstContentLine ?? title;
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
    '{"markdown":"完整 Markdown","summary":"执行摘要","tags":["标签1","标签2"]}',
    retryInstruction,
    buildMemoryInstruction(getSessionResearchMemory()),
  ].join('\n');
}

async function generateResearchText(
  input: ResearchAgentInput,
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<string> {
  const client = getLlmClient();
  const mcpTools = getMcpTools();
  const mcpToolNames = new Set(Object.keys(mcpTools));
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: getResearchSystemPrompt(),
    prompt: buildResearchPrompt(input),
    tools: {
      browser_search: createBrowserSearchTool(),
      ...mcpTools,
    },
    toolChoice: 'auto',
    maxSteps: 8,
    onStepFinish: step => {
      const activities = collectToolActivities([step], mcpToolNames);
      activities.forEach(activity => {
        if (activity.output !== undefined) {
          rememberSessionResearch({
            toolName: activity.toolName,
            input: activity.input,
            output: activity.output,
          });
        }
        reportActivity({
          type: 'progress',
          phase: 'tool-call',
          message: `深度调研「${input.topic.title}」：${activity.toolName}`,
          operationId: activity.operationId,
          input: activity.input,
          ...(activity.output === undefined ? {} : { output: activity.output }),
        });
      });
    },
  });
  reportTokenUsages(
    `深度调研：${input.topic.title}`,
    result.steps.map(step => step.usage),
    reportActivity
  );

  return result.text;
}

export function parseResearchArtifact(
  title: string,
  rawText: string
): DeepResearchArtifact {
  const jsonResult = parseJsonResearchResult(rawText);
  if (jsonResult === undefined) {
    const markdown = rawText.trim();
    if (!markdown) throw new Error('调研输出不能为空');
    return {
      title,
      markdown,
      summary: summarizePlainText(markdown, title),
      tags: ['深度调研', title.slice(0, 30)],
    };
  }

  const parsed = ResearchResultSchema.parse(jsonResult);
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
  generate: ResearchTextGenerator,
  reportActivity: LlmActivityReporter
): Promise<DeepResearchArtifact> {
  let invalidResponse: string | undefined;
  let attempt = 0;

  while (true) {
    attempt += 1;
    reportActivity({
      type: 'progress',
      phase: 'sub-agent',
      message: `深度调研「${input.topic.title}」开始第 ${attempt} 轮执行`,
      details: input.topic.executionGoal,
    });
    const rawText = await generate({ ...input, invalidResponse }, reportActivity);
    try {
      const artifact = parseResearchArtifact(input.topic.title, rawText);
      reportActivity({
        type: 'progress',
        phase: 'sub-agent',
        message: `深度调研「${input.topic.title}」已完成`,
        details: artifact.summary,
      });
      return artifact;
    } catch (error) {
      invalidResponse = getErrorMessage(error);
      reportActivity({
        type: 'progress',
        phase: 'sub-agent',
        message: `深度调研「${input.topic.title}」第 ${attempt} 轮输出校验失败，正在修正`,
        details: invalidResponse,
      });
    }
  }
}

export async function runDeepResearch(
  input: DeepResearchInput,
  generate: ResearchTextGenerator = generateResearchText,
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<readonly DeepResearchArtifact[]> {
  const topics = deduplicateResearchTopics(input.topics);
  return Promise.all(topics.map(topic => researchTopic({
    topic,
    mainTitle: input.mainTitle,
    mainMarkdown: input.mainMarkdown,
    sessionMessages: input.sessionMessages,
  }, generate, reportActivity)));
}
