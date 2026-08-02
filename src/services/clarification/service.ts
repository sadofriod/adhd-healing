import { generateText } from 'ai';
import type {
  LlmClarifyDecision,
  LlmDecision,
  LlmFinalDecisionDraft,
  LlmProgressDecision,
  LlmProgressPhase,
  LlmProgressReporter,
} from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getMcpTools } from '../mcp';
import { SYSTEM_PROMPT } from './agent';
import { classifyArchiveDocument } from './archive';
import { createBrowserSearchTool } from './browser-search-tool';
import { parseDecision } from './decision';
import { buildDecisionPrompt } from './prompts';
import { runDeepResearch } from './research';
import { collectToolDisplayNames } from './tool-usage';
import type { SessionMessage } from './types';

export type DecisionGeneration = {
  readonly text: string;
  readonly phaseHint?: LlmProgressPhase;
  readonly toolNames?: readonly string[];
};

export type DecisionGenerator = (
  sessionMessages: readonly SessionMessage[],
  progress?: LlmProgressDecision
) => Promise<DecisionGeneration>;

const ignoreProgress: LlmProgressReporter = () => undefined;

function reportDecisionStatement(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft,
  reportProgress: LlmProgressReporter
): void {
  reportProgress({
    type: 'progress',
    phase: 'process',
    message: decision.type === 'final' ? 'LLM 已形成最终决策' : 'LLM 已形成澄清问题',
    details: decision.message,
  });
}

function createToolProgress(toolNames: readonly string[]): LlmProgressDecision {
  return {
    type: 'progress',
    phase: 'tool-call',
    message: `工具调用：${toolNames.join('、')}`,
  };
}

function reportTerminalToolUsage(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  toolNames: readonly string[],
  reportProgress: LlmProgressReporter
): void {
  if (decision.type === 'progress') return;
  if (toolNames.length === 0) return;
  const toolProgress = createToolProgress(toolNames);
  console.log(`[clarification] Internal progress (tool-call): ${toolProgress.message}`);
  reportProgress(toolProgress);
}

function attachToolNames(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  toolNames: readonly string[]
): LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision {
  if (decision.type !== 'progress') return decision;
  if (toolNames.length === 0) return decision;
  return {
    ...createToolProgress(toolNames),
    details: decision.message,
  };
}

function getGenerationToolNames(
  generation: DecisionGeneration
): readonly string[] {
  return generation.toolNames ?? [];
}

async function generateDecision(
  sessionMessages: readonly SessionMessage[],
  progress?: LlmProgressDecision
): Promise<DecisionGeneration> {
  const client = getLlmClient();
  const mcpTools = getMcpTools();
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionPrompt(sessionMessages, progress),
    tools: {
      browser_search: createBrowserSearchTool(),
      ...mcpTools,
    },
    toolChoice: 'auto',
    maxSteps: 5,
  });

  const toolNames = collectToolDisplayNames(
    result.steps,
    new Set(Object.keys(mcpTools))
  );
  if (toolNames.length > 0) {
    return { text: result.text, phaseHint: 'tool-call', toolNames };
  }
  return { text: result.text };
}

async function addArchiveToFinalDecision(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft,
  sessionMessages: readonly SessionMessage[],
  reportProgress: LlmProgressReporter
): Promise<LlmDecision> {
  if (decision.type !== 'final') return decision;

  reportProgress({
    type: 'progress',
    phase: 'sub-agent',
    message: `正在并行执行归档分类与 ${decision.researchTopics.length} 项深度调研`,
  });
  const [archive, researchArtifacts] = await Promise.all([
    classifyArchiveDocument({
      title: decision.title,
      markdown: decision.markdown,
      sessionMessages,
    }),
    runDeepResearch({
      topics: decision.researchTopics,
      mainTitle: decision.title,
      mainMarkdown: decision.markdown,
      sessionMessages,
    }),
  ]);
  reportProgress({
    type: 'progress',
    phase: 'sub-agent',
    message: '归档分类与深度调研已完成',
  });

  return { ...decision, archive, researchArtifacts };
}

export async function makeDecision(
  sessionMessages: readonly SessionMessage[],
  reportProgress: LlmProgressReporter = ignoreProgress
): Promise<LlmDecision> {
  reportProgress({
    type: 'progress',
    phase: 'process',
    message: '正在分析当前对话并形成下一步决策',
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
  reportProgress: LlmProgressReporter = ignoreProgress
): Promise<LlmClarifyDecision | LlmFinalDecisionDraft> {
  const generation = await generate(sessionMessages, progress);
  const parsedDecision = parseDecision(generation.text, generation.phaseHint);
  const toolNames = getGenerationToolNames(generation);
  reportTerminalToolUsage(
    parsedDecision,
    toolNames,
    reportProgress
  );
  const decision = attachToolNames(parsedDecision, toolNames);
  if (decision.type !== 'progress') {
    reportDecisionStatement(decision, reportProgress);
    return decision;
  }

  console.log(
    `[clarification] Internal progress (${decision.phase}): ${decision.message}`
  );
  reportProgress(decision);
  return resolveDecisionDraft(sessionMessages, generate, decision, reportProgress);
}