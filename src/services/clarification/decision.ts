import { z } from 'zod';
import type { LlmDecision, LlmFinalDecision } from '../../types.js';

const DEFAULT_CLARIFY_QUESTION = '先别继续铺开。现在最影响判断的那个关键约束是什么？';

const DecisionSchema = z.object({
  type: z.enum(['clarify', 'final']),
  message: z.string().trim().min(1),
  markdown: z.string().trim().optional(),
  milestone: z.string().trim().optional(),
  title: z.string().trim().optional(),
});

type ParsedDecision = z.infer<typeof DecisionSchema>;
type DecisionWithoutArchive = Omit<LlmFinalDecision, 'archive'> | LlmDecision;

function extractJsonObject(rawText: string): string {
  const match = rawText.match(/\{[\s\S]*\}/);
  return match?.[0] ?? rawText;
}

function normalizeClarifyDecision(message: string): LlmDecision {
  const trimmed = message.trim();
  if (trimmed.endsWith('？') || trimmed.endsWith('?')) {
    return { type: 'clarify', message: trimmed };
  }

  return { type: 'clarify', message: DEFAULT_CLARIFY_QUESTION };
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

function normalizeFinalDecision(parsed: ParsedDecision): Omit<LlmFinalDecision, 'archive'> {
  return {
    type: 'final',
    message: parsed.message,
    markdown: getFinalMarkdown(parsed),
    milestone: getFinalMilestone(parsed),
    title: getFinalTitle(parsed),
  };
}

export function parseDecision(rawText: string): DecisionWithoutArchive {
  try {
    const parsed = DecisionSchema.parse(JSON.parse(extractJsonObject(rawText)));
    if (parsed.type === 'clarify') return normalizeClarifyDecision(parsed.message);
    return normalizeFinalDecision(parsed);
  } catch {
    return normalizeClarifyDecision(rawText);
  }
}