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

type JsonExtractionState = {
  readonly objects: string[];
  depth: number;
  start: number;
  inString: boolean;
  escaped: boolean;
};

function createJsonExtractionState(): JsonExtractionState {
  return {
    objects: [],
    depth: 0,
    start: -1,
    inString: false,
    escaped: false,
  };
}

function consumeStringCharacter(state: JsonExtractionState, char: string): boolean {
  if (!state.inString) return false;
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === '\\') {
    state.escaped = true;
    return true;
  }
  if (char === '"') state.inString = false;
  return true;
}

function openString(state: JsonExtractionState, char: string): boolean {
  if (char !== '"') return false;
  state.inString = true;
  return true;
}

function openJsonObject(state: JsonExtractionState, char: string, index: number): boolean {
  if (char !== '{') return false;
  if (state.depth === 0) state.start = index;
  state.depth += 1;
  return true;
}

function closeJsonObject(
  state: JsonExtractionState,
  char: string,
  index: number,
  rawText: string
): void {
  if (char !== '}' || state.depth === 0) return;
  state.depth -= 1;
  if (state.depth !== 0 || state.start === -1) return;
  state.objects.push(rawText.slice(state.start, index + 1));
  state.start = -1;
}

function consumeJsonCharacter(
  state: JsonExtractionState,
  char: string,
  index: number,
  rawText: string
): void {
  if (consumeStringCharacter(state, char)) return;
  if (openString(state, char)) return;
  if (openJsonObject(state, char, index)) return;
  closeJsonObject(state, char, index, rawText);
}

function extractJsonObjects(rawText: string): readonly string[] {
  const state = createJsonExtractionState();

  for (let index = 0; index < rawText.length; index += 1) {
    consumeJsonCharacter(state, rawText[index]!, index, rawText);
  }

  return state.objects;
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
  const parsedDecisions = extractJsonObjects(rawText).flatMap(jsonText => {
    try {
      return [DecisionSchema.parse(JSON.parse(jsonText))];
    } catch {
      return [];
    }
  });

  if (parsedDecisions.length === 0) return null;

  const lastFinalDecision = parsedDecisions
    .filter(decision => decision.type === 'final')
    .at(-1);
  if (lastFinalDecision) return lastFinalDecision;

  return parsedDecisions.at(-1) ?? null;
}

function extractDecisionMessage(rawText: string): string {
  const objects = extractJsonObjects(rawText);
  if (objects.length === 0) return rawText;
  const [firstObject] = objects;
  if (!firstObject) return rawText;
  const start = rawText.indexOf(firstObject);
  if (start === -1) return rawText;

  const plainPrefix = rawText.slice(0, start).trim();
  if (plainPrefix) return plainPrefix;

  return rawText;
}

function normalizeToolThenFinalNarration(rawText: string): DecisionParseResult | null {
  const message = extractDecisionMessage(rawText).trim();
  if (!message) return null;
  if (!rawText.includes('"type":"final"')) return null;
  if (isClarificationRequest(message)) return null;

  return {
    type: 'progress',
    phase: inferProgressPhase(message),
    message,
  };
}

function tryNormalizeMixedNarration(rawText: string): DecisionParseResult | null {
  const normalized = normalizeToolThenFinalNarration(rawText);
  if (normalized) return normalized;
  return null;
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
  const mixedNarration = tryNormalizeMixedNarration(rawText);
  if (mixedNarration) return mixedNarration;

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