import type { SessionMessage } from './types';
import type { LlmProgressDecision } from '../../types';
import type { SessionResearchMemory } from '../session';

const DECISION_PROMPT_TEMPLATE = `
下面是当前会话历史（JSON）：
{session}

请先判断是否还需要继续追问。

输出必须是严格 JSON，不要输出 Markdown 代码块，不要输出额外解释。

如果还需要继续追问，输出：
{"type":"clarify","message":"只包含一个问题的追问句"}

如果正在进行内部分析、工具调用或子 Agent 调研，尚不能追问或收工，输出：
{"type":"progress","phase":"process | tool-call | sub-agent","message":"当前内部推进状态"}

progress 仅用于确实无法在本次生成中取得结果的异步步骤。工具返回后必须基于已有结果输出 clarify 或 final，不得为了继续搜索而输出 progress，也不得重复查询已经获得的事实。

如果已经可以收工，输出：
{"type":"final","message":"最终 Markdown 的简短导语","markdown":"包含有语义 Obsidian 双链网络的完整 Markdown 报告","milestone":"不含‘20分钟任务’前缀、以动词开头、尽量不超过24字的提醒事项标题","title":"稳定、干净且适合作为 Obsidian 节点名的归档标题","researchTopics":[{"title":"稳定且具体的调研产物标题","scope":"明确的研究边界","relevance":"它为何直接影响主报告落地","executionGoal":"调研后必须能指导执行的目标"}]}

researchTopics 可以为空数组。只有垂直、细分或交叉领域会直接改变主报告执行方案时才加入；普通背景知识、弱相关延伸和主报告已充分覆盖的内容不得加入。每个主题会启动独立深度调研子 Agent。
`.trim();

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
  memory: readonly SessionResearchMemory[] = []
): string {
  const prompt = DECISION_PROMPT_TEMPLATE.replace(
    '{session}',
    JSON.stringify(sessionMessages)
  ) + buildMemoryInstruction(memory);
  if (!progress) return prompt;
  return `${prompt}\n\n${buildProgressInstruction(progress)}`;
}