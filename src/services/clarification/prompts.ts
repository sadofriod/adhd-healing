import type { SessionMessage } from './types';

const DECISION_PROMPT_TEMPLATE = `
下面是当前会话历史（JSON）：
{session}

请先判断是否还需要继续追问。

输出必须是严格 JSON，不要输出 Markdown 代码块，不要输出额外解释。

如果还需要继续追问，输出：
{"type":"clarify","message":"只包含一个问题的追问句"}

如果已经可以收工，输出：
{"type":"final","message":"最终 Markdown 的简短导语","markdown":"完整 Markdown 报告","milestone":"不含‘20分钟任务’前缀、以动词开头、尽量不超过24字的提醒事项标题","title":"归档标题"}
`.trim();

function buildRetryInstruction(invalidResponse: string): string {
  return `

上一次输出无效，因为它是陈述、过程说明或不符合格式：
${JSON.stringify(invalidResponse.slice(0, 500))}

不要汇报工具调用、等待状态、推理过程或“已经掌握信息”。立即重新判断：信息足够就输出 final；确实缺少一个关键决策时，才输出 clarify，并确保 message 是直接向用户提出的一个真实问题。
`.trimEnd();
}

export function buildDecisionPrompt(
  sessionMessages: SessionMessage[],
  invalidResponse?: string
): string {
  const prompt = DECISION_PROMPT_TEMPLATE.replace('{session}', JSON.stringify(sessionMessages));
  if (!invalidResponse) return prompt;
  return `${prompt}\n\n${buildRetryInstruction(invalidResponse)}`;
}