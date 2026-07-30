import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';
import type { ArchiveClassification, LlmDecision, LlmFinalDecision } from '../types.js';
import { getLlmClient, CHAT_MODEL } from './llm-client.js';
import { searchWeb } from './web-search.js';
import { getArchiveTaxonomy } from './vault.js';

const DEFAULT_CLARIFY_QUESTION = '先别继续铺开。现在最影响判断的那个关键约束是什么？';

const BrowserSearchArgsSchema = z.object({
  query: z.string().trim().min(1).max(240),
  engine: z.enum(['google', 'duckduckgo', 'bing', 'all']).default('all'),
});

const DecisionSchema = z.object({
  type: z.enum(['clarify', 'final']),
  message: z.string().trim().min(1),
  markdown: z.string().trim().optional(),
  milestone: z.string().trim().optional(),
  title: z.string().trim().optional(),
});

const ArchiveClassificationSchema = z.object({
  category: z.string().trim().min(1).max(40),
  subcategory: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(160),
  tags: z.array(z.string().trim().min(1).max(30)).min(2).max(8),
});

const SYSTEM_PROMPT = `
你是一个顶级的设计大脑催产师。用户是一位技术资深但注意力容易分散的 TS 开发者。
你正在通过语音或文字和他进行多轮脑暴，帮他把混乱模糊的想法提炼成具体的 Milestone（里程碑）。

工作法则：
1. 不要迎合用户。如果他的点子太宏大，逼问他：第一步的技术选型是什么？核心痛点到底是什么？
2. 保持高能、精准。每次追问只允许提一个问题，不能让用户认知过载。
3. 对设计树各分支逐一澄清，优先解决会影响后续实现的依赖决策。
4. 如果用户要求结合最新资料、文档、产品更新、生态动态或外部事实，优先调用 browser_search 工具后再回答。
5. 一旦细节足够，立刻收束，不要继续拖轮次，直接输出最终 Markdown 和 20 分钟里程碑。
`.trim();

const DECISION_PROMPT_TEMPLATE = `
下面是当前会话历史（JSON）：
{session}

请先判断是否还需要继续追问。

输出必须是严格 JSON，不要输出 Markdown 代码块，不要输出额外解释。

如果还需要继续追问，输出：
{"type":"clarify","message":"只包含一个问题的追问句"}

如果已经可以收工，输出：
{"type":"final","message":"最终 Markdown 的简短导语","markdown":"完整 Markdown 报告","milestone":"20分钟任务标题","title":"归档标题"}
`.trim();

function buildDecisionPrompt(sessionMessages: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  return DECISION_PROMPT_TEMPLATE.replace('{session}', JSON.stringify(sessionMessages));
}

function getArchiveSystemPrompt(existingCategories: readonly string[], existingSubcategories: readonly string[]): string {
  return [
    '你是一个知识库归档助手。',
    '你要把一段已经完成的脑暴对话归类到稳定、可复用的知识库分类中。',
    '优先复用已有分类，避免同义重复。',
    existingCategories.length > 0
      ? `已有一级分类：${existingCategories.join('、')}`
      : '当前还没有既有一级分类，可新建最稳定的一级分类。',
    existingSubcategories.length > 0
      ? `已有二级分类：${existingSubcategories.join('、')}`
      : '当前还没有既有二级分类，可新建最稳定的二级分类。',
    '输出字段要求：',
    '- category：一级分类，中文短语，稳定抽象层，例如“CAD工具”“AI工作流”“产品策略”',
    '- subcategory：二级分类，中文短语，更贴近具体主题',
    '- summary：一句 160 字以内摘要，便于 index.md 检索',
    '- tags：2 到 8 个短标签，优先中文，可混合英文技术名词',
  ].join('\n');
}

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

function getFinalMarkdown(parsed: z.infer<typeof DecisionSchema>): string {
  return parsed.markdown ?? parsed.message;
}

function getFinalMilestone(parsed: z.infer<typeof DecisionSchema>): string {
  return parsed.milestone ?? '明确 20 分钟第一步';
}

function getFinalTitle(parsed: z.infer<typeof DecisionSchema>): string {
  return parsed.title ?? '未命名想法';
}

function normalizeFinalDecision(parsed: z.infer<typeof DecisionSchema>): Omit<LlmFinalDecision, 'archive'> {
  return {
    type: 'final',
    message: parsed.message,
    markdown: getFinalMarkdown(parsed),
    milestone: getFinalMilestone(parsed),
    title: getFinalTitle(parsed),
  };
}

function parseDecision(rawText: string): Omit<LlmFinalDecision, 'archive'> | LlmDecision {
  try {
    const parsed = DecisionSchema.parse(JSON.parse(extractJsonObject(rawText)));

    if (parsed.type === 'clarify') {
      return normalizeClarifyDecision(parsed.message);
    }

    return normalizeFinalDecision(parsed);
  } catch {
    return normalizeClarifyDecision(rawText);
  }
}

export async function classifyArchiveDocument(input: {
  title: string;
  markdown: string;
  sessionMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<ArchiveClassification> {
  const client = getLlmClient();
  const taxonomy = await getArchiveTaxonomy();
  const { object } = await generateObject({
    model: client(CHAT_MODEL),
    schema: ArchiveClassificationSchema,
    system: getArchiveSystemPrompt(taxonomy.categories, taxonomy.subcategories),
    prompt: [
      `标题：${input.title}`,
      '',
      '最终 Markdown：',
      input.markdown,
      '',
      '对话历史（JSON，可为空）：',
      JSON.stringify(input.sessionMessages ?? []),
    ].join('\n'),
  });

  return {
    category: object.category,
    subcategory: object.subcategory,
    summary: object.summary,
    tags: object.tags,
  };
}

function createBrowserSearchTool() {
  return tool({
    description: [
      'Search the public web when the user asks for current information, official docs, product updates, ecosystem changes, or external facts.',
      'Use Google, DuckDuckGo, Bing, or all of them.',
    ].join(' '),
    parameters: BrowserSearchArgsSchema,
    execute: async args => searchWeb(args.query, { engine: args.engine }),
  });
}

async function generateDecisionText(
  sessionMessages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<string> {
  const client = getLlmClient();
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: SYSTEM_PROMPT,
    prompt: buildDecisionPrompt(sessionMessages),
    tools: {
      browser_search: createBrowserSearchTool(),
    },
    toolChoice: 'auto',
    maxSteps: 5,
  });

  return result.text;
}

export async function makeDecision(
  sessionMessages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<LlmDecision> {
  const rawText = await generateDecisionText(sessionMessages);
  const decision = parseDecision(rawText);

  if (decision.type !== 'final') return decision;

  const archive = await classifyArchiveDocument({
    title: decision.title,
    markdown: decision.markdown,
    sessionMessages,
  });

  return {
    ...decision,
    archive,
  };
}

export { SYSTEM_PROMPT };
