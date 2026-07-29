import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import { getLlmClient } from './llm-client.js';
import { config } from '../config/env.js';
import type { LlmDecision, LlmClarifyDecision, LlmFinalDecision, Session } from '../types.js';

const FINALIZE_TRIGGERS = ['直接总结', 'summarize now', 'finalize', '总结一下'];

const SYSTEM_CLARIFY = `你是一个想法澄清助手，帮助用户通过聚焦追问逐步澄清和蒸馏想法。

规则：
1. 如果信息不足（缺少目标、受众、约束、时间范围或成功标准），仅提出一个聚焦问题。
2. 如果信息已充分或用户要求直接总结，输出最终蒸馏结果。
3. 必须以 JSON 格式响应，不得有额外文字。

澄清格式：{"type":"clarify","message":"你的单一聚焦问题"}
最终格式：{"type":"final","message":"简短总结","markdown":"包含三个区块的完整Markdown"}

最终 Markdown 必须包含以下三个区块：
### 🎯 今日灵感内核
### 🔄 历史思维连线 (RAG 检索结果)
### 🚀 20分钟强制里程碑 (Milestone)`;

const SYSTEM_FINAL = `你是一个想法蒸馏助手。无论信息是否充分，请立即输出最终蒸馏结果。

必须以 JSON 格式响应：{"type":"final","message":"简短总结","markdown":"完整Markdown"}

Markdown 必须包含：
### 🎯 今日灵感内核
### 🔄 历史思维连线 (RAG 检索结果)
### 🚀 20分钟强制里程碑 (Milestone)`;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function hasRequiredFields(val: Record<string, unknown>): boolean {
  if (typeof val['type'] !== 'string' || typeof val['message'] !== 'string') return false;
  if (val['type'] === 'final') return typeof val['markdown'] === 'string';
  return true;
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
  return callLlmForClarifyOrFinal(sessionContext, ragContext);
}

export function toClarifyDecision(decision: LlmDecision): LlmClarifyDecision {
  return { type: 'clarify', message: decision.message };
}
