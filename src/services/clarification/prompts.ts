import type { SessionMessage } from './types';
import type { LlmProgressDecision } from '../../types';
import type { SessionResearchMemory } from '../session';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale';

const DECISION_PROMPT_TEMPLATE = `
下面是当前会话历史（JSON）：
{session}

请先判断是否还需要继续追问。

输出必须是严格 JSON，不要输出 Markdown 代码块，不要输出额外解释。

如果仍存在任何会改变核心痛点、技术选型、第一个可交付物或 20 分钟任务的关键未知项，必须继续追问，而不是收工。每次只允许追问一个最关键的问题；只有当你能明确判断已无值得继续追问的关键问题时，才允许输出 final。

Markdown 必须同时适合作为独立 Obsidian 笔记：主报告要聚焦一个明确的决策/里程碑，给出足够上下文；双链必须克制，只保留少量确实值得沉淀为独立文档的 \`[[双链]]\`，且每个目标文档都要由你明确选择，不能为了凑数量链接泛词；只有高度相关且足够独立的垂直/细分/交叉领域才进入 researchTopics。

如果必须等待用户回答，输出：
{"type":"clarify","message":"只包含一个问题的追问句"}

如果只是给出阶段性陈述、不需要用户回复且应继续自动执行，输出：
{"type":"note","message":"阶段性陈述"}

如果正在进行内部分析、工具调用或子 Agent 调研，尚不能追问或收工，输出：
{"type":"progress","phase":"process | tool-call | sub-agent","message":"当前内部推进状态"}

progress 仅用于确实无法在本次生成中取得结果的异步步骤。工具返回后必须基于已有结果输出 clarify 或 final，不得为了继续搜索而输出 progress，也不得重复查询已经获得的事实。

如果已经可以收工，输出：
{"type":"final","message":"最终 Markdown 的简短导语","markdown":"包含有语义 Obsidian 双链网络的完整 Markdown 报告","milestone":"不含‘20分钟任务’前缀、以动词开头、尽量不超过24字的提醒事项标题","title":"稳定、干净且适合作为 Obsidian 节点名的归档标题","researchTopics":[{"title":"稳定且具体的调研产物标题","scope":"明确的研究边界","relevance":"它为何直接影响主报告落地","executionGoal":"调研后必须能指导执行的目标"}]}

researchTopics 可以为空数组。只有垂直、细分或交叉领域会直接改变主报告执行方案时才加入；普通背景知识、弱相关延伸和主报告已充分覆盖的内容不得加入。每个主题会启动独立深度调研子 Agent，子 Agent 不向用户追问。
`.trim();

const DECISION_PROMPT_TEMPLATE_EN = `
Here is the current session history (JSON):
{session}

Decide first whether you still need to ask a follow-up question.

Output must be strict JSON only. Do not output Markdown code fences. Do not output extra explanations.

If any unknown can still change the core pain point, technical direction, first deliverable, or the 20-minute action, you must ask exactly one most critical follow-up question instead of finishing. You may output final only when there are no meaningful high-impact unknowns left.

Markdown must be suitable as a standalone Obsidian note: focus on one clear decision/milestone with enough context; keep wiki links \`[[...]]\` sparse and intentional; each linked target must be explicitly chosen for durable knowledge value. Add researchTopics only when a vertical/niche/cross-domain topic is both highly relevant and independent enough to deserve separate deep research.

If you must wait for user input, output:
{"type":"clarify","message":"A single follow-up question only"}

If you only need to share a statement and should continue automatically without user reply, output:
{"type":"note","message":"A brief progress statement"}

If you are still in internal analysis, tool execution, or sub-agent research and cannot clarify/finalize yet, output:
{"type":"progress","phase":"process | tool-call | sub-agent","message":"Current internal progress"}

Use progress only for truly asynchronous internal steps. After tool results arrive, you must output clarify or final based on available facts. Do not keep outputting progress only to continue searching. Do not re-query facts already obtained.

If you can finalize now, output:
{"type":"final","message":"Short lead-in for the final Markdown","markdown":"Complete Markdown report with semantic Obsidian wiki links","milestone":"Reminder title that starts with a verb and is ideally <=24 chars, without any fixed prefix","title":"Stable clean archive title suitable as an Obsidian node name","researchTopics":[{"title":"Stable concrete deep-research output title","scope":"Clear research boundary","relevance":"Why this directly changes implementation","executionGoal":"A concrete execution-guiding outcome after research"}]}

researchTopics may be an empty array. Add a topic only when it can directly change implementation choices of the main report. Exclude weakly-related expansion, generic background, or content already sufficiently covered in the main report. Each topic will launch an independent deep-research sub-agent that does not ask the user.
`.trim();

function getOutputLanguageInstruction(locale: Locale): string {
  if (locale === 'en') {
    return [
      'Output language rule (strict):',
      '- All user-facing text values MUST be in English.',
      '- This includes message, markdown, milestone, title, summary, tags, and progress text.',
      '- Keep JSON keys and enums unchanged (type, phase, clarify/progress/final, etc.).',
    ].join('\n');
  }
  return [
    '输出语言规则（严格执行）：',
    '- 所有面向用户的文本值必须使用简体中文。',
    '- 包括 message、markdown、milestone、title、summary、tags、progress 文本。',
    '- JSON 键名和枚举值保持不变（type、phase、clarify/progress/final 等）。',
  ].join('\n');
}

function getDecisionPromptTemplate(locale: Locale): string {
  if (locale === 'en') return DECISION_PROMPT_TEMPLATE_EN;
  return DECISION_PROMPT_TEMPLATE;
}

function serializeMemoryOutput(output: unknown): string {
  try {
    return JSON.stringify(output) ?? String(output);
  } catch {
    return String(output);
  }
}

export function buildMemoryInstruction(memory: readonly SessionResearchMemory[]): string {
  if (memory.length === 0) return '';
  const entries = memory.map(entry => ({
    toolName: entry.toolName,
    input: entry.input,
    output: serializeMemoryOutput(entry.output),
  }));
  return `
Session 调研记忆（已经完成的工具查询）：
${JSON.stringify(entries)}

调用工具前必须先检查上述记忆。相同工具且 input 语义相同的查询必须直接复用已有 output；只有缺少完成当前决策所需的新事实时，才允许发起不同 input 的新查询。`;
}

function buildProgressInstruction(progress: LlmProgressDecision): string {
  return `

上一次内部推进状态：
${JSON.stringify(progress)}

继续完成内部工作。只有需要用户回答一个真实问题时才输出 clarify；信息足够时输出 final；仍在内部分析、调用工具或等待子 Agent 结果时继续输出 progress。
`.trimEnd();
}

export function buildDecisionPrompt(
  sessionMessages: readonly SessionMessage[],
  progress?: LlmProgressDecision,
  memory: readonly SessionResearchMemory[] = [],
  locale: Locale = DEFAULT_LOCALE
): string {
  const prompt = getDecisionPromptTemplate(locale).replace(
    '{session}',
    JSON.stringify(sessionMessages)
  ) + `\n\n${getOutputLanguageInstruction(locale)}` + buildMemoryInstruction(memory);
  if (!progress) return prompt;
  return `${prompt}\n\n${buildProgressInstruction(progress)}`;
}