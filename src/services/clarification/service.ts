import { generateText } from 'ai';
import type {
  DeepResearchArtifact,
  LlmClarifyDecision,
  LlmDecision,
  LlmFinalDecisionDraft,
  LlmActivityReporter,
  LlmProgressDecision,
  LlmProgressPhase,
  LlmTokenUsage,
} from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { reportTokenUsages } from '../token-usage';
import { getSessionResearchMemory } from '../session';
import { rememberCompressedSessionResearch } from '../session-memory';
import { SYSTEM_PROMPT } from './agent';
import { classifyArchiveDocument } from './archive';
import { createBrowserSearchTool } from './browser-search-tool';
import {
  attachToolNames,
  collectGenerationMetadata,
  createDecisionGeneration,
  getGenerationToolFailures,
  getGenerationToolNames,
  reportDecisionStatement,
  reportGenerationToolUsage,
} from './decision-progress';
import { parseDecision } from './decision';
import { buildDecisionPrompt } from './prompts';
import { runDeepResearch } from './research';
import type { ToolActivity, ToolFailure } from './tool-usage';
import type { SessionMessage } from './types';

export type DecisionGeneration = {
  readonly text: string;
  readonly phaseHint?: LlmProgressPhase;
  readonly toolActivities?: readonly ToolActivity[];
  readonly toolNames?: readonly string[];
  readonly toolFailures?: readonly ToolFailure[];
  readonly tokenUsages?: readonly LlmTokenUsage[];
};

export type DecisionGenerator = (
  sessionMessages: readonly SessionMessage[],
  progress?: LlmProgressDecision,
  excludedToolNames?: ReadonlySet<string>
) => Promise<DecisionGeneration>;

const ignoreProgress: LlmActivityReporter = () => undefined;

async function rememberToolActivities(
  activities: readonly ToolActivity[],
  reportProgress: LlmActivityReporter
): Promise<void> {
  await Promise.all(activities.map(async activity => {
    if (activity.output === undefined) return;
    await rememberCompressedSessionResearch({
      toolName: activity.toolName,
      input: activity.input,
      output: activity.output,
    }, reportProgress);
  }));
}


async function generateDecision(
  sessionMessages: readonly SessionMessage[],
  progress?: LlmProgressDecision,
  excludedToolNames: ReadonlySet<string> = new Set(),
  reportProgress: LlmActivityReporter = ignoreProgress
): Promise<DecisionGeneration> {
  const client = getLlmClient();
  const mcpTools = getMcpTools();
  const availableMcpTools = Object.fromEntries(
    Object.entries(mcpTools).filter(([toolName]) => !excludedToolNames.has(toolName))
  );
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionPrompt(sessionMessages, progress, getSessionResearchMemory()),
    tools: {
      browser_search: createBrowserSearchTool(),
      ...availableMcpTools,
    },
    toolChoice: 'auto',
    maxSteps: 5,
  });

  const availableToolNames = new Set(Object.keys(availableMcpTools));
  const metadata = collectGenerationMetadata(result.steps, availableToolNames);
  await rememberToolActivities(metadata.toolActivities, reportProgress);
  return createDecisionGeneration(
    result.text,
    metadata.toolNames,
    metadata.toolActivities,
    metadata.toolFailures,
    metadata.tokenUsages
  );
}

function formatResearchTasks(
  topics: LlmFinalDecisionDraft['researchTopics']
): string {
  if (topics.length === 0) return '- 无待调研主题';
  return topics.map(
    topic => `- ${topic.title}：${topic.executionGoal}`
  ).join('\n');
}

function formatResearchResults(
  artifacts: readonly DeepResearchArtifact[]
): string {
  if (artifacts.length === 0) return '- 无深度调研产物';
  return artifacts.map(
    artifact => `- ${artifact.title}：${artifact.summary}`
  ).join('\n');
}

async function addArchiveToFinalDecision(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft,
  sessionMessages: readonly SessionMessage[],
  reportProgress: LlmActivityReporter
): Promise<LlmDecision> {
  if (decision.type !== 'final') return decision;

  reportProgress({
    type: 'progress',
    phase: 'sub-agent',
    message: `正在并行执行归档分类与 ${decision.researchTopics.length} 项深度调研`,
    details: [
      `归档分类：分析《${decision.title}》的分类、摘要与标签`,
      '深度调研：',
      formatResearchTasks(decision.researchTopics),
    ].join('\n'),
  });
  const [archive, researchArtifacts] = await Promise.all([
    classifyArchiveDocument({
      title: decision.title,
      markdown: decision.markdown,
      sessionMessages,
    }, reportProgress),
    runDeepResearch({
      topics: decision.researchTopics,
      mainTitle: decision.title,
      mainMarkdown: decision.markdown,
      sessionMessages,
    }, undefined, reportProgress),
  ]);
  reportProgress({
    type: 'progress',
    phase: 'sub-agent',
    message: '归档分类与深度调研已完成',
    details: [
      `归档分类：${archive.category} / ${archive.subcategory}`,
      `归档摘要：${archive.summary}`,
      `归档标签：${archive.tags.join('、')}`,
      '深度调研结果：',
      formatResearchResults(researchArtifacts),
    ].join('\n'),
  });

  return { ...decision, archive, researchArtifacts };
}

export async function makeDecision(
  sessionMessages: readonly SessionMessage[],
  reportProgress: LlmActivityReporter = ignoreProgress
): Promise<LlmDecision> {
  const researchMemory = getSessionResearchMemory();
  reportProgress({
    type: 'progress',
    phase: 'process',
    message: '正在分析当前对话并形成下一步决策',
    ...(researchMemory.length > 0 ? {
      details: `已加载 ${researchMemory.length} 条 Session 调研记忆，将优先复用已有结果`,
    } : {}),
  });
  const decision = await resolveDecisionDraft(
    sessionMessages,
    (messages, progress, excludedTools) => generateDecision(
      messages,
      progress,
      excludedTools,
      reportProgress
    ),
    undefined,
    reportProgress
  );
  return addArchiveToFinalDecision(decision, sessionMessages, reportProgress);
}

export async function resolveDecisionDraft(
  sessionMessages: readonly SessionMessage[],
  generate: DecisionGenerator,
  progress?: LlmProgressDecision,
  reportProgress: LlmActivityReporter = ignoreProgress
): Promise<LlmClarifyDecision | LlmFinalDecisionDraft> {
  return resolveDecisionDraftWithState(
    sessionMessages,
    generate,
    progress,
    reportProgress,
    { excludedToolNames: new Set() }
  );
}

type ResolutionState = {
  readonly excludedToolNames: ReadonlySet<string>;
};

async function resolveDecisionDraftWithState(
  sessionMessages: readonly SessionMessage[],
  generate: DecisionGenerator,
  progress: LlmProgressDecision | undefined,
  reportProgress: LlmActivityReporter,
  state: ResolutionState
): Promise<LlmClarifyDecision | LlmFinalDecisionDraft> {
  const generation = await generate(
    sessionMessages,
    progress,
    state.excludedToolNames
  );
  reportTokenUsages(
    '澄清决策',
    (generation.tokenUsages ?? []).map(usage => ({
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    })),
    reportProgress
  );
  const parsedDecision = parseDecision(generation.text, generation.phaseHint);
  const toolNames = getGenerationToolNames(generation);
  const toolFailures = getGenerationToolFailures(generation);
  reportGenerationToolUsage(parsedDecision, generation, reportProgress);
  const decision = attachToolNames(parsedDecision, toolNames, toolFailures);
  if (decision.type !== 'progress') {
    reportDecisionStatement(decision, reportProgress);
    return decision;
  }

  reportProgress(decision);
  const excludedToolNames = new Set(state.excludedToolNames);
  toolFailures.forEach(failure => excludedToolNames.add(failure.toolName));
  return resolveDecisionDraftWithState(
    sessionMessages,
    generate,
    decision,
    reportProgress,
    {
      excludedToolNames,
    }
  );
}