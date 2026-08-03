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
import { getSessionResearchMemory, rememberSessionResearch } from '../session';
import { SYSTEM_PROMPT } from './agent';
import { classifyArchiveDocument } from './archive';
import { createBrowserSearchTool } from './browser-search-tool';
import { parseDecision } from './decision';
import { buildDecisionPrompt } from './prompts';
import { runDeepResearch } from './research';
import {
  collectToolActivities,
  collectToolDisplayNames,
  collectToolFailures,
  type ToolActivity,
  type ToolFailure,
} from './tool-usage';
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

function reportDecisionStatement(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft,
  reportProgress: LlmActivityReporter
): void {
  reportProgress({
    type: 'progress',
    phase: 'process',
    message: decision.type === 'final' ? 'LLM 已形成最终决策' : 'LLM 已形成澄清问题',
    details: decision.message,
  });
}

function createToolProgress(
  toolNames: readonly string[],
  details?: string
): LlmProgressDecision {
  return {
    type: 'progress',
    phase: 'tool-call',
    message: `工具调用：${toolNames.join('、')}`,
    ...(details ? { details } : {}),
  };
}

function reportTerminalToolUsage(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  toolNames: readonly string[],
  reportProgress: LlmActivityReporter
): void {
  if (decision.type === 'progress') return;
  if (toolNames.length === 0) return;
  const toolProgress = createToolProgress(toolNames);
  reportProgress(toolProgress);
}

function reportToolActivities(
  activities: readonly ToolActivity[],
  reportProgress: LlmActivityReporter
): void {
  activities.forEach(activity => reportProgress({
    type: 'progress',
    phase: 'tool-call',
    message: activity.toolName,
    operationId: activity.operationId,
    input: activity.input,
    ...(activity.output === undefined ? {} : { output: activity.output }),
  }));
}

function rememberToolActivities(activities: readonly ToolActivity[]): void {
  activities.forEach(activity => {
    if (activity.output === undefined) return;
    rememberSessionResearch({
      toolName: activity.toolName,
      input: activity.input,
      output: activity.output,
    });
  });
}

function reportGenerationToolUsage(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  generation: DecisionGeneration,
  reportProgress: LlmActivityReporter
): void {
  const activities = generation.toolActivities ?? [];
  if (activities.length > 0) {
    reportToolActivities(activities, reportProgress);
    return;
  }
  reportTerminalToolUsage(decision, getGenerationToolNames(generation), reportProgress);
}

function buildToolProgressDetails(
  decisionMessage: string,
  toolFailures: readonly ToolFailure[]
): string {
  const failureDetails = toolFailures.map(
    failure => `${failure.toolName}: ${failure.error}`
  ).join('；');
  if (!failureDetails) return decisionMessage;
  return `${decisionMessage}。失败工具（后续不要重试）：${failureDetails}`;
}

function attachToolNames(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  toolNames: readonly string[],
  toolFailures: readonly ToolFailure[]
): LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision {
  if (decision.type !== 'progress') return decision;
  if (toolNames.length === 0) return decision;
  return {
    ...createToolProgress(
      toolNames,
      buildToolProgressDetails(decision.message, toolFailures)
    ),
  };
}

function getGenerationToolNames(
  generation: DecisionGeneration
): readonly string[] {
  return generation.toolNames ?? [];
}

function getGenerationToolFailures(
  generation: DecisionGeneration
): readonly ToolFailure[] {
  return generation.toolFailures ?? [];
}

async function generateDecision(
  sessionMessages: readonly SessionMessage[],
  progress?: LlmProgressDecision,
  excludedToolNames: ReadonlySet<string> = new Set()
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

  const toolNames = collectToolDisplayNames(
    result.steps,
    new Set(Object.keys(availableMcpTools))
  );
  const toolActivities = collectToolActivities(
    result.steps,
    new Set(Object.keys(availableMcpTools))
  );
  rememberToolActivities(toolActivities);
  const toolFailures = collectToolFailures(result.steps);
  const tokenUsages = result.steps.map(step => ({
    inputTokens: step.usage.promptTokens,
    outputTokens: step.usage.completionTokens,
    totalTokens: step.usage.totalTokens,
  }));
  if (toolNames.length > 0) {
    return {
      text: result.text,
      phaseHint: 'tool-call',
      toolActivities,
      toolNames,
      toolFailures,
      tokenUsages,
    };
  }
  return { text: result.text, tokenUsages };
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
    generateDecision,
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