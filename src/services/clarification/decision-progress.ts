import type {
  LlmClarifyDecision,
  LlmFinalDecisionDraft,
  LlmActivityReporter,
  LlmProgressDecision,
  LlmTokenUsage,
} from '../../types';
import {
  collectToolActivities,
  collectToolDisplayNames,
  collectToolFailures,
  type ToolCallStep,
  type ToolResultStep,
  type ToolActivity,
  type ToolFailure,
} from './tool-usage';

export type DecisionGeneration = {
  readonly text: string;
  readonly phaseHint?: 'process' | 'tool-call' | 'sub-agent';
  readonly toolNames?: readonly string[];
  readonly toolActivities?: readonly ToolActivity[];
  readonly toolFailures?: readonly ToolFailure[];
  readonly tokenUsages?: readonly LlmTokenUsage[];
};

const ignoreProgress: LlmActivityReporter = () => undefined;

export function reportDecisionStatement(
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

export function createToolProgress(
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

export function reportTerminalToolUsage(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  toolNames: readonly string[],
  reportProgress: LlmActivityReporter
): void {
  if (decision.type === 'progress') return;
  if (toolNames.length === 0) return;
  const toolProgress = createToolProgress(toolNames);
  reportProgress(toolProgress);
}

export function reportToolActivities(
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

export function reportGenerationToolUsage(
  decision: LlmClarifyDecision | LlmFinalDecisionDraft | LlmProgressDecision,
  generation: DecisionGeneration,
  reportProgress: LlmActivityReporter = ignoreProgress
): void {
  const activities = getGenerationToolActivities(generation);
  if (activities.length > 0) {
    reportToolActivities(activities, reportProgress);
    return;
  }
  reportTerminalToolUsage(decision, getGenerationToolNames(generation), reportProgress);
}

export function buildToolProgressDetails(
  decisionMessage: string,
  toolFailures: readonly ToolFailure[]
): string {
  const failureDetails = toolFailures.map(
    failure => `${failure.toolName}: ${failure.error}`
  ).join('；');
  if (!failureDetails) return decisionMessage;
  return `${decisionMessage}。失败工具（后续不要重试）：${failureDetails}`;
}

export function attachToolNames(
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

export function getGenerationToolActivities(
  generation: DecisionGeneration
): readonly ToolActivity[] {
  return generation.toolActivities ?? [];
}

export function getGenerationToolNames(
  generation: DecisionGeneration
): readonly string[] {
  return generation.toolNames ?? [];
}

export function getGenerationToolFailures(
  generation: DecisionGeneration
): readonly ToolFailure[] {
  return generation.toolFailures ?? [];
}

export function createDecisionGeneration(
  text: string,
  toolNames: readonly string[],
  toolActivities: readonly ToolActivity[],
  toolFailures: readonly ToolFailure[],
  tokenUsages: readonly LlmTokenUsage[]
): DecisionGeneration {
  if (toolNames.length === 0) return { text, tokenUsages };
  return {
    text,
    phaseHint: 'tool-call',
    toolActivities,
    toolNames,
    toolFailures,
    tokenUsages,
  };
}

export function collectGenerationMetadata(
  steps: readonly {
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
    toolCalls?: ToolCallStep['toolCalls'];
    toolResults?: ToolResultStep['toolResults'];
  }[],
  availableMcpTools: ReadonlySet<string>
): {
  readonly toolNames: readonly string[];
  readonly toolActivities: readonly ToolActivity[];
  readonly toolFailures: readonly ToolFailure[];
  readonly tokenUsages: readonly LlmTokenUsage[];
} {
  const callSteps: ToolCallStep[] = steps.map(step => ({
    toolCalls: step.toolCalls ?? [],
  }));
  const resultSteps: ToolResultStep[] = steps.map(step => ({
    toolResults: step.toolResults ?? [],
  }));
  const activitySteps: Array<ToolCallStep & ToolResultStep> = steps.map(step => ({
    toolCalls: step.toolCalls ?? [],
    toolResults: step.toolResults ?? [],
  }));

  return {
    toolNames: collectToolDisplayNames(callSteps, availableMcpTools),
    toolActivities: collectToolActivities(activitySteps, availableMcpTools),
    toolFailures: collectToolFailures(resultSteps),
    tokenUsages: steps.map(step => ({
      inputTokens: step.usage.promptTokens,
      outputTokens: step.usage.completionTokens,
      totalTokens: step.usage.totalTokens,
    })),
  };
}
