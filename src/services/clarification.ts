import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import { getLlmClient } from './llm-client.js';
import { config } from '../config/env.js';
import type { LlmDecision, LlmClarifyDecision, LlmFinalDecision, Session } from '../types.js';

const FINALIZE_TRIGGERS = ['直接总结', 'summarize now', 'finalize', '总结一下'];
const MINIMUM_DECISION_DIMENSIONS = 3;
const RICH_CONTEXT_MIN_LENGTH = 120;
const RICH_CONTEXT_MIN_USER_MESSAGES = 2;

const SYSTEM_CLARIFY = `你是一个想法澄清助手，帮助用户通过聚焦追问逐步澄清和蒸馏想法。

规则：
1. 如果信息不足（缺少目标、受众、约束、时间范围或成功标准），仅提出一个聚焦问题。
2. 如果信息已充分或用户要求直接总结，输出最终蒸馏结果。
3. 必须以 JSON 格式响应，不得有额外文字。
4. 最多只允许进行 3 轮澄清问题；达到第 3 轮后，下次必须直接输出最终结果。

澄清格式：{"type":"clarify","message":"你的单一聚焦问题"}
最终格式：{"type":"final","message":"简短总结","markdown":"包含三个区块的完整Markdown"}

最终 Markdown 必须包含以下三个区块：
### 🎯 今日灵感内核
### 🔄 历史思维连线 (RAG 检索结果)
### 🚀 20分钟强制里程碑 (Milestone)

格式要求：
- “今日灵感内核”区块第一行必须是一句总结性的简述，后面再写补充说明。
- “20分钟强制里程碑”区块第一行必须是一句总结性的行动标题，后面必须给出分步骤 Markdown 列表。`;

const SYSTEM_FINAL = `你是一个想法蒸馏助手。无论信息是否充分，请立即输出最终蒸馏结果。

必须以 JSON 格式响应：{"type":"final","message":"简短总结","markdown":"完整Markdown"}

Markdown 必须包含：
### 🎯 今日灵感内核
### 🔄 历史思维连线 (RAG 检索结果)
### 🚀 20分钟强制里程碑 (Milestone)

格式要求：
- “今日灵感内核”区块第一行必须是一句总结性的简述，后面再写补充说明。
- “20分钟强制里程碑”区块第一行必须是一句总结性的行动标题，后面必须给出分步骤 Markdown 列表。`;

const CLARIFY_FALLBACK_QUESTIONS = [
  {
    keywords: ['目标', '产出', '结果', '用途', '解决'],
    question: '你希望这个想法最终产出成什么，或者帮你解决什么问题？',
  },
  {
    keywords: ['受众', '用户', '给谁', '谁用', '自己', '团队'],
    question: '这个想法主要是给谁用的：只给你自己，还是也要给别人使用？',
  },
  {
    keywords: ['约束', '限制', '本地', '隐私', '预算', '15 秒', '响应'],
    question: '你现在最重要的约束是什么，比如时间、工具、本地优先还是隐私要求？',
  },
  {
    keywords: ['时间', '这周', '今天', '本周', '期限', '截止'],
    question: '你希望在什么时间范围内验证或完成这件事？',
  },
  {
    keywords: ['成功标准', '验证', '指标', '算成功', '完成'],
    question: '这件事做到什么程度，你会认为这次想法整理是成功的？',
  },
] as const;

const DEFAULT_CLARIFY_QUESTION = '你现在最想先澄清的是目标、受众、约束、时间范围还是成功标准？';

type ClarificationDimension = Readonly<{
  keywords: readonly string[];
  question: string;
}>;

const CLARIFICATION_DIMENSIONS: readonly ClarificationDimension[] =
  CLARIFY_FALLBACK_QUESTIONS;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function hasDecisionType(val: Record<string, unknown>): boolean {
  return typeof val['type'] === 'string';
}

function hasDecisionMessage(val: Record<string, unknown>): boolean {
  return typeof val['message'] === 'string';
}

function hasFinalMarkdown(val: Record<string, unknown>): boolean {
  if (val['type'] !== 'final') return true;
  return typeof val['markdown'] === 'string';
}

function hasRequiredFields(val: Record<string, unknown>): boolean {
  if (!hasDecisionType(val)) return false;
  if (!hasDecisionMessage(val)) return false;
  return hasFinalMarkdown(val);
}

function isLlmDecision(val: unknown): val is LlmDecision {
  return isPlainObject(val) && hasRequiredFields(val as Record<string, unknown>);
}

function extractJson(content: string): string {
  const match = content.match(/\{[\s\S]*\}/);
  return match ? match[0] : content;
}

function parseLlmDecision(raw: string): LlmDecision {
  try {
    const parsed: unknown = JSON.parse(extractJson(raw));
    if (isLlmDecision(parsed)) return parsed;
    return { type: 'clarify', message: raw.trim() };
  } catch {
    return { type: 'clarify', message: raw.trim() };
  }
}

function getFirstChoiceContent(response: ChatCompletion): string {
  if (response.choices.length === 0) return '';
  const content = response.choices[0].message.content;
  return content ?? '';
}

function buildUserMessage(sessionContext: string, ragContext: string): string {
  return `【会话历史】\n${sessionContext}\n\n【历史相关想法】\n${ragContext}`;
}

function extractUserContext(sessionContext: string): string {
  return sessionContext
    .split('\n')
    .filter(line => line.startsWith('用户:'))
    .map(line => line.replace(/^用户:\s*/, '').trim())
    .join('\n');
}

function countUserMessages(sessionContext: string): number {
  return sessionContext.split('\n').filter(line => line.startsWith('用户:')).length;
}

function normalizeContextForMatching(text: string): string {
  return text.toLowerCase();
}

function includesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

function hasQuestionSuffix(message: string): boolean {
  return message.endsWith('？') || message.endsWith('?');
}

function countQuestionMarks(message: string): number {
  return Array.from(message).filter(char => char === '？' || char === '?').length;
}

function containsClarifyFormatting(message: string): boolean {
  return message.includes('###') || message.includes('\n');
}

function matchesSingleQuestionShape(message: string): boolean {
  return [
    message.length > 0,
    !containsClarifyFormatting(message),
    hasQuestionSuffix(message),
    countQuestionMarks(message) === 1,
  ].every(Boolean);
}

function isSingleQuestion(message: string): boolean {
  return matchesSingleQuestionShape(message.trim());
}

function countCoveredDecisionDimensions(sessionContext: string): number {
  const userContext = normalizeContextForMatching(extractUserContext(sessionContext));

  return CLARIFICATION_DIMENSIONS.filter(candidate => {
    return includesAnyKeyword(userContext, candidate.keywords);
  }).length;
}

function hasRichUserContext(sessionContext: string): boolean {
  const userContext = extractUserContext(sessionContext);
  return [
    userContext.length >= RICH_CONTEXT_MIN_LENGTH,
    countUserMessages(sessionContext) >= RICH_CONTEXT_MIN_USER_MESSAGES,
  ].every(Boolean);
}

function hasSufficientDecisionContext(sessionContext: string): boolean {
  const coveredDimensions = countCoveredDecisionDimensions(sessionContext);

  if (coveredDimensions >= MINIMUM_DECISION_DIMENSIONS) return true;
  if (coveredDimensions >= MINIMUM_DECISION_DIMENSIONS - 1 && hasRichUserContext(sessionContext)) {
    return true;
  }

  return false;
}

function findMissingClarificationQuestion(sessionContext: string): string | null {
  const userContext = normalizeContextForMatching(extractUserContext(sessionContext));
  if (userContext.length === 0) return DEFAULT_CLARIFY_QUESTION;

  const missingDimension = CLARIFICATION_DIMENSIONS.find(candidate => {
    return !includesAnyKeyword(userContext, candidate.keywords);
  });

  return missingDimension?.question ?? null;
}

function buildFallbackClarifyQuestion(sessionContext: string): string {
  return findMissingClarificationQuestion(sessionContext) ?? DEFAULT_CLARIFY_QUESTION;
}

function normalizeClarifyDecision(
  decision: LlmDecision,
  sessionContext: string
): LlmDecision | LlmClarifyDecision {
  if (decision.type !== 'clarify') return decision;
  if (isSingleQuestion(decision.message)) return decision;

  return {
    type: 'clarify',
    message: buildFallbackClarifyQuestion(sessionContext),
  };
}

export function enforceDecisionConstraints(
  decision: LlmDecision,
  sessionContext: string
): LlmDecision {
  if (decision.type === 'clarify') {
    return normalizeClarifyDecision(decision, sessionContext);
  }

  if (hasSufficientDecisionContext(sessionContext)) return decision;

  return {
    type: 'clarify',
    message: buildFallbackClarifyQuestion(sessionContext),
  };
}

async function callLlm(systemPrompt: string, userMessage: string): Promise<LlmDecision> {
  const response = await getLlmClient().chat.completions.create({
    model: config.chatModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });
  return parseLlmDecision(getFirstChoiceContent(response));
}

export async function callLlmForClarifyOrFinal(
  sessionContext: string,
  ragContext: string
): Promise<LlmDecision> {
  const userMessage = buildUserMessage(sessionContext, ragContext);
  return callLlm(SYSTEM_CLARIFY, userMessage);
}

export async function callLlmForFinal(
  sessionContext: string,
  ragContext: string
): Promise<LlmFinalDecision> {
  const userMessage = buildUserMessage(sessionContext, ragContext);
  const decision = await callLlm(SYSTEM_FINAL, userMessage);
  if (decision.type === 'final') return decision;
  return { type: 'final', message: decision.message, markdown: decision.message };
}

function hasTriggerWord(context: string): boolean {
  return FINALIZE_TRIGGERS.some(trigger => context.includes(trigger));
}

export function shouldForceFinalize(turnCount: number, context: string): boolean {
  if (turnCount >= config.maxClarificationTurns) return true;
  return hasTriggerWord(context);
}

export function isFinalDecision(decision: LlmDecision): decision is LlmFinalDecision {
  return decision.type === 'final';
}

export async function makeDecision(
  session: Session,
  sessionContext: string,
  ragContext: string
): Promise<LlmDecision> {
  if (shouldForceFinalize(session.turn_count, sessionContext)) {
    return callLlmForFinal(sessionContext, ragContext);
  }

  const decision = await callLlmForClarifyOrFinal(sessionContext, ragContext);
  return enforceDecisionConstraints(decision, sessionContext);
}

export function toClarifyDecision(decision: LlmDecision): LlmClarifyDecision {
  return { type: 'clarify', message: decision.message };
}
