import type { SessionMessage } from './types.js';

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

export function buildDecisionPrompt(sessionMessages: SessionMessage[]): string {
  return DECISION_PROMPT_TEMPLATE.replace('{session}', JSON.stringify(sessionMessages));
}