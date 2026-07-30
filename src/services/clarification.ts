import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions.js';
import type { Completion } from 'openai/resources/completions.js';
import { z } from 'zod';
import { config } from '../config/env.js';
import type { LlmDecision, LlmClarifyDecision, LlmFinalDecision, Session } from '../types.js';
import {
  getClarificationSystemPrompt,
  getCompletionFallbackNotes,
} from './clarification/agent.js';
import { getLlmClient } from './llm-client.js';
import { searchWeb } from './web-search.js';

const FINALIZE_TRIGGERS = ['直接总结', 'summarize now', 'finalize', '总结一下'];
const TOOL_CALL_LIMIT = 3;
const BROWSER_SEARCH_TOOL_NAME = 'browser_search';
const COMPLETION_FALLBACK_MAX_TOKENS = 1200;
const completionFallbackModels = new Set<string>();
const DEFAULT_CLARIFY_QUESTION = '先别继续铺开。现在最影响判断的那个关键约束是什么？';

const browserSearchArgumentsSchema = z.object({
  engine: z.enum(['google', 'bing', 'duckduckgo', 'all']).optional(),
  query: z.string().trim().min(1).max(240),
});

const BROWSER_SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: BROWSER_SEARCH_TOOL_NAME,
    description: [
      'Search the public web when the user asks about current facts, external websites, product updates, documentation changes, recent news, or anything that may require fresh public context.',
      'Use Google, Bing, DuckDuckGo, or all of them. Keep queries focused and short.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A focused web search query that can surface the latest public information relevant to the user idea.',
        },
        engine: {
          type: 'string',
          enum: ['google', 'bing', 'duckduckgo', 'all'],
          description: 'Preferred search engine. Use all when you want broader coverage.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

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

function getFirstCompletionText(response: Completion): string {
  if (response.choices.length === 0) return '';
  return response.choices[0].text ?? '';
}

function getFirstChoiceToolCalls(response: ChatCompletion): readonly ChatCompletionMessageToolCall[] {
  if (response.choices.length === 0) return [];
  return response.choices[0].message.tool_calls ?? [];
}

function buildUserMessage(sessionContext: string, ragContext: string): string {
  return [
    '【当前日期】',
    new Date().toISOString().slice(0, 10),
    '',
    '【输出约束】',
    '- “今日灵感内核”和“20分钟强制里程碑”只能来自【会话历史】里的当前用户输入。',
    '- 【历史相关想法】只能用于“历史思维连线 (RAG 检索结果)”区块，不能覆盖当前想法。',
    '',
    '【会话历史】',
    sessionContext,
    '',
    '【历史相关想法】',
    ragContext,
  ].join('\n');
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

function buildInitialMessages(systemPrompt: string, userMessage: string): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
}

function buildCompletionFallbackPrompt(systemPrompt: string, userMessage: string): string {
  return [
    systemPrompt,
    '',
    getCompletionFallbackNotes(),
    '',
    '【用户上下文】',
    userMessage,
  ].join('\n');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isPromptTemplateCompatibilityError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return [
    'error rendering prompt with jinja template',
    'unknown test: sequence',
  ].some(fragment => message.includes(fragment));
}

function shouldUseCompletionFallback(model: string): boolean {
  return completionFallbackModels.has(model);
}

function markModelAsCompletionFallback(model: string): void {
  completionFallbackModels.add(model);
}

export function resetCompletionFallbackModels(): void {
  completionFallbackModels.clear();
}

async function callLlmWithCompletionFallback(
  systemPrompt: string,
  userMessage: string
): Promise<LlmDecision> {
  const response = await getLlmClient().completions.create({
    model: config.chatModel,
    prompt: buildCompletionFallbackPrompt(systemPrompt, userMessage),
    max_tokens: COMPLETION_FALLBACK_MAX_TOKENS,
    temperature: 0.2,
  });

  return parseLlmDecision(getFirstCompletionText(response));
}

function getFirstChoiceMessage(
  response: ChatCompletion
): ChatCompletion['choices'][number]['message'] | null {
  return response.choices[0]?.message ?? null;
}

function normalizeAssistantContent(
  content: ChatCompletion['choices'][number]['message']['content']
): string | null {
  return typeof content === 'string' ? content : null;
}

function createAssistantToolCallMessageFromChoice(
  message: ChatCompletion['choices'][number]['message']
): ChatCompletionAssistantMessageParam | null {
  const toolCalls = message.tool_calls;
  if (!toolCalls || toolCalls.length === 0) return null;

  return {
    role: 'assistant',
    content: normalizeAssistantContent(message.content),
    tool_calls: toolCalls,
  };
}

function createAssistantToolCallMessage(
  response: ChatCompletion
): ChatCompletionAssistantMessageParam | null {
  const message = getFirstChoiceMessage(response);
  if (!message) return null;
  return createAssistantToolCallMessageFromChoice(message);
}

function buildToolErrorResponse(toolCallId: string, message: string): ChatCompletionToolMessageParam {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify({ error: message, results: [] }),
  };
}

function parseBrowserSearchArguments(rawArguments: string): z.infer<typeof browserSearchArgumentsSchema> | null {
  try {
    const parsed = JSON.parse(rawArguments) as unknown;
    const result = browserSearchArgumentsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function isBrowserSearchToolCall(toolCall: ChatCompletionMessageToolCall): boolean {
  return toolCall.function.name === BROWSER_SEARCH_TOOL_NAME;
}

async function runBrowserSearchToolCall(
  toolCall: ChatCompletionMessageToolCall
): Promise<ChatCompletionToolMessageParam> {
  const args = parseBrowserSearchArguments(toolCall.function.arguments);
  if (!args) {
    return buildToolErrorResponse(toolCall.id, 'Invalid browser_search arguments');
  }

  const result = await searchWeb(args.query, { engine: args.engine ?? 'all' });

  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: JSON.stringify(result),
  };
}

async function runToolCall(toolCall: ChatCompletionMessageToolCall): Promise<ChatCompletionToolMessageParam> {
  if (!isBrowserSearchToolCall(toolCall)) {
    return buildToolErrorResponse(toolCall.id, `Unsupported tool: ${toolCall.function.name}`);
  }

  return runBrowserSearchToolCall(toolCall);
}

function normalizeClarifyDecision(
  decision: LlmDecision
): LlmDecision | LlmClarifyDecision {
  if (decision.type !== 'clarify') return decision;
  if (isSingleQuestion(decision.message)) return decision;

  return {
    type: 'clarify',
    message: DEFAULT_CLARIFY_QUESTION,
  };
}

export function enforceDecisionConstraints(decision: LlmDecision): LlmDecision {
  if (decision.type === 'clarify') {
    return normalizeClarifyDecision(decision);
  }

  return decision;
}

async function requestChatCompletion(
  messages: ChatCompletionMessageParam[]
): Promise<ChatCompletion> {
  return getLlmClient().chat.completions.create({
    model: config.chatModel,
    messages,
    tools: [BROWSER_SEARCH_TOOL],
    tool_choice: 'auto',
  });
}

async function recoverPromptTemplateCompatibility(
  error: unknown,
  systemPrompt: string,
  userMessage: string
): Promise<LlmDecision> {
  if (!isPromptTemplateCompatibilityError(error)) throw error;

  markModelAsCompletionFallback(config.chatModel);
  console.warn(
    `[clarification] LM Studio rejected chat prompt template for ${config.chatModel}; retrying with raw completion fallback and caching that compatibility result for later requests.`
  );
  return callLlmWithCompletionFallback(systemPrompt, userMessage);
}

async function requestChatCompletionOrFallback(
  messages: ChatCompletionMessageParam[],
  systemPrompt: string,
  userMessage: string
): Promise<ChatCompletion | LlmDecision> {
  try {
    return await requestChatCompletion(messages);
  } catch (error) {
    return recoverPromptTemplateCompatibility(error, systemPrompt, userMessage);
  }
}

function isDecisionResult(result: ChatCompletion | LlmDecision): result is LlmDecision {
  return 'type' in result;
}

function appendToolCallMessages(
  messages: ChatCompletionMessageParam[],
  response: ChatCompletion,
  toolMessages: readonly ChatCompletionToolMessageParam[]
): ChatCompletionMessageParam[] {
  const assistantMessage = createAssistantToolCallMessage(response);
  const assistantMessages = assistantMessage ? [assistantMessage] : [];

  return [...messages, ...assistantMessages, ...toolMessages];
}

async function continueChatLoop(
  response: ChatCompletion,
  messages: ChatCompletionMessageParam[],
  systemPrompt: string,
  userMessage: string,
  remainingToolRounds: number
): Promise<LlmDecision> {
  const toolCalls = getFirstChoiceToolCalls(response);
  if (toolCalls.length === 0) {
    return parseLlmDecision(getFirstChoiceContent(response));
  }

  const toolMessages = await Promise.all(toolCalls.map(runToolCall));
  return runChatLoop(
    appendToolCallMessages(messages, response, toolMessages),
    systemPrompt,
    userMessage,
    remainingToolRounds - 1
  );
}

async function runChatLoop(
  messages: ChatCompletionMessageParam[],
  systemPrompt: string,
  userMessage: string,
  remainingToolRounds: number
): Promise<LlmDecision> {
  if (remainingToolRounds < 0) {
    return {
      type: 'clarify',
      message: DEFAULT_CLARIFY_QUESTION,
    };
  }

  const result = await requestChatCompletionOrFallback(messages, systemPrompt, userMessage);
  if (isDecisionResult(result)) return result;

  return continueChatLoop(result, messages, systemPrompt, userMessage, remainingToolRounds);
}

async function callLlm(systemPrompt: string, userMessage: string): Promise<LlmDecision> {
  if (shouldUseCompletionFallback(config.chatModel)) {
    return callLlmWithCompletionFallback(systemPrompt, userMessage);
  }

  return runChatLoop(
    buildInitialMessages(systemPrompt, userMessage),
    systemPrompt,
    userMessage,
    TOOL_CALL_LIMIT
  );
}

export async function callLlmForClarifyOrFinal(
  sessionContext: string,
  ragContext: string
): Promise<LlmDecision> {
  const userMessage = buildUserMessage(sessionContext, ragContext);
  return callLlm(getClarificationSystemPrompt('clarify'), userMessage);
}

export async function callLlmForFinal(
  sessionContext: string,
  ragContext: string
): Promise<LlmFinalDecision> {
  const userMessage = buildUserMessage(sessionContext, ragContext);
  const decision = await callLlm(getClarificationSystemPrompt('final'), userMessage);
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
  return enforceDecisionConstraints(decision);
}

export function toClarifyDecision(decision: LlmDecision): LlmClarifyDecision {
  return { type: 'clarify', message: decision.message };
}
