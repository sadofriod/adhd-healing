import { z } from 'zod';
import type {
  DeepResearchTopic,
  LlmClarifyDecision,
  LlmFinalDecisionDraft,
  LlmProgressDecision,
  LlmProgressPhase,
} from '../../types';

const EMPTY_PROGRESS_MESSAGE = '模型尚未形成可交付决策';

const DecisionSchema = z.object({
  type: z.enum(['clarify', 'progress', 'final']),
  message: z.string().trim().min(1),
  phase: z.enum(['process', 'tool-call', 'sub-agent']).optional(),
  markdown: z.string().trim().optional(),
  milestone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  researchTopics: z.array(z.object({
    title: z.string().trim().min(1).max(100),
    scope: z.string().trim().min(1).max(500),
    relevance: z.string().trim().min(1).max(500),
    executionGoal: z.string().trim().min(1).max(500),
  })).default([]),
});

type ParsedDecision = z.infer<typeof DecisionSchema>;
export type DecisionParseResult =
  | LlmClarifyDecision
  | LlmProgressDecision
  | LlmFinalDecisionDraft;

function extractJsonObject(rawText: string): string {
  const match = rawText.match(/\{[\s\S]*\}/);
  return match?.[0] ?? rawText;
}

function isClarificationRequest(message: string): boolean {
  if (/[?？]\s*$/u.test(message)) return true;
  return /^(?:请(?:你)?(?:说明|选择|确认|补充|提供|描述)|能否|是否|要不要|有没有)/u.test(message);
}

function inferProgressPhase(message: string): LlmProgressPhase {
  if (/子\s*agent|sub-?agent|深度调研/u.test(message)) return 'sub-agent';
  if (/工具|调用|搜索|检索|查询/u.test(message)) return 'tool-call';
  return 'process';
}

function normalizeClarifyDecision(message: string): DecisionParseResult {
  const trimmed = message.trim();
  if (!trimmed) return {
    type: 'progress',
    phase: 'process',
    message: EMPTY_PROGRESS_MESSAGE,
  };
  if (isClarificationRequest(trimmed)) return { type: 'clarify', message: trimmed };
  return {
    type: 'progress',
    phase: inferProgressPhase(trimmed),
    message: trimmed,
  };
}

function getFinalMarkdown(parsed: ParsedDecision): string {
  return parsed.markdown ?? parsed.message;
}

function getFinalMilestone(parsed: ParsedDecision): string {
  return parsed.milestone ?? '明确 20 分钟第一步';
}

function getFinalTitle(parsed: ParsedDecision): string {
  return parsed.title ?? '未命名想法';
}

function normalizeResearchTopics(
  topics: readonly DeepResearchTopic[]
): readonly DeepResearchTopic[] {
  return topics.map(topic => ({
    title: topic.title,
    scope: topic.scope,
    relevance: topic.relevance,
    executionGoal: topic.executionGoal,
  }));
}

function normalizeFinalDecision(parsed: ParsedDecision): LlmFinalDecisionDraft {
  return {
    type: 'final',
    message: parsed.message,
    markdown: getFinalMarkdown(parsed),
    milestone: getFinalMilestone(parsed),
    title: getFinalTitle(parsed),
    researchTopics: normalizeResearchTopics(parsed.researchTopics),
  };
}

function normalizeProgressDecision(
  parsed: ParsedDecision,
  phaseHint?: LlmProgressPhase
): LlmProgressDecision {
  return {
    type: 'progress',
    phase: phaseHint ?? parsed.phase ?? inferProgressPhase(parsed.message),
    message: parsed.message,
  };
}

function tryParseStructuredDecision(rawText: string): ParsedDecision | null {
  try {
    return DecisionSchema.parse(JSON.parse(extractJsonObject(rawText)));
  } catch {
    return null;
  }
}

function normalizeParsedDecision(
  parsed: ParsedDecision,
  phaseHint?: LlmProgressPhase
): DecisionParseResult {
  if (parsed.type === 'clarify') return normalizeClarifyDecision(parsed.message);
  if (parsed.type === 'progress') return normalizeProgressDecision(parsed, phaseHint);
  return normalizeFinalDecision(parsed);
}

function normalizeUnstructuredDecision(
  rawText: string,
  phaseHint?: LlmProgressPhase
): DecisionParseResult {
  if (rawText.trim()) return normalizeClarifyDecision(rawText);
  if (!phaseHint) return normalizeClarifyDecision(rawText);
  return {
    type: 'progress',
    phase: phaseHint,
    message: '工具步骤已执行，继续形成业务决策',
  };
}

export function parseDecision(
  rawText: string,
  phaseHint?: LlmProgressPhase
): DecisionParseResult {
  const parsed = tryParseStructuredDecision(rawText);
  if (parsed) return normalizeParsedDecision(parsed, phaseHint);
  return normalizeUnstructuredDecision(rawText, phaseHint);
}