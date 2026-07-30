import { generateObject } from 'ai';
import { z } from 'zod';
import type { LlmDecision } from '../types.js';
import { getLlmClient, CHAT_MODEL } from './llm-client.js';

const DistillSchema = z.object({
  action: z.enum(['ASK_MORE', 'COMPLETE']).describe(
    '如果用户想法还很模糊或太宏大，设为 ASK_MORE；如果细节足够可以落地，设为 COMPLETE'
  ),
  replyText: z.string().describe(
    '当 ASK_MORE 时，写下一轮犀利的追问（不超过50字）。当 COMPLETE 时，输出完整的 Markdown 脑暴提炼报告。'
  ),
  milestone: z.string().describe(
    '只有当 COMPLETE 时，提炼出一个 20 分钟内坐在电脑前就能立刻完成的具体 TS 代码/配置/文档任务标题，否则留空。'
  ),
  title: z.string().describe(
    '只有当 COMPLETE 时，生成用于 Markdown 文件命名的干净标题，否则留空。'
  ),
});

const SYSTEM_PROMPT = `
你是一个顶级的设计大脑催产师。用户是一位技术资深但注意力容易分散的 TS 开发者。
你正在通过语音和他进行多轮脑暴，帮他把混乱模糊的想法提炼成具体的 Milestone（里程碑）。

工作法则：
1. 不要迎合用户。如果他的点子太宏大，逼问他：'第一步的技术选型是什么？'、'核心痛点到底是什么？'
2. 保持高能、精准。每次追问【只允许提一个问题】，绝不让多动症用户感到认知过载。
3. 一旦细节足够（通常2-3轮），立刻将 action 设为 COMPLETE，并给出硬核的 20分钟 Milestone！
`.trim();

export async function makeDecision(
  sessionMessages: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<LlmDecision> {
  const client = getLlmClient();

  const { object } = await generateObject({
    model: client(CHAT_MODEL),
    schema: DistillSchema,
    system: SYSTEM_PROMPT,
    prompt: JSON.stringify(sessionMessages),
  });

  if (object.action === 'ASK_MORE') {
    return { type: 'clarify', message: object.replyText };
  }

  return {
    type: 'final',
    message: object.replyText,
    markdown: object.replyText,
    milestone: object.milestone,
    title: object.title,
  };
}
