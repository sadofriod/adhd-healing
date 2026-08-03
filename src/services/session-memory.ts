import { generateText } from 'ai';
import type { LlmActivityReporter, LlmTokenUsage } from '../types';
import { getLlmClient, CHAT_MODEL } from './llm-client';
import {
  rememberSessionResearch,
  type SessionResearchEvidence,
} from './session';
import { reportTokenUsages } from './token-usage';

const MEMORY_OUTPUT_LENGTH = 2_000;
export type MemoryCompressionResult = {
  readonly text: string;
  readonly usage?: LlmTokenUsage;
};

export type MemoryCompressor = (
  evidence: SessionResearchEvidence
) => Promise<MemoryCompressionResult>;

function serializeOutput(output: unknown): string {
  try {
    return JSON.stringify(output) ?? String(output);
  } catch {
    return String(output);
  }
}

function buildCompressionPrompt(evidence: SessionResearchEvidence): string {
  return [
    `工具：${evidence.toolName}`,
    `Input：${JSON.stringify(evidence.input)}`,
    'Output：',
    serializeOutput(evidence.output),
    '',
    '将 Output 压缩为可供后续 Agent 复用的调研记忆。',
    '必须保留结论、关键事实、数字、日期、版本、URL、文件路径、错误和证据来源。',
    '压缩结果尽量控制在 2000 个字符以内；若保真所需，可以超过该长度。',
    '不得补充 Output 中不存在的信息。直接输出压缩后的纯文本，不要 Markdown 代码块。',
  ].join('\n');
}

async function compressWithLlm(
  evidence: SessionResearchEvidence
): Promise<MemoryCompressionResult> {
  const client = getLlmClient();
  const result = await generateText({
    model: client(CHAT_MODEL),
    system: '你负责压缩工具调研结果，必须忠实保留可验证事实，不得推测或扩写。',
    prompt: buildCompressionPrompt(evidence),
  });
  return {
    text: result.text,
    usage: {
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}

function reportCompressionUsage(
  usage: LlmTokenUsage | undefined,
  reportActivity: LlmActivityReporter
): void {
  if (!usage) return;
  reportTokenUsages('Session memory 压缩', [{
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }], reportActivity);
}

export async function rememberCompressedSessionResearch(
  evidence: SessionResearchEvidence,
  reportActivity: LlmActivityReporter,
  compress: MemoryCompressor = compressWithLlm
): Promise<void> {
  const serializedOutput = serializeOutput(evidence.output);
  if (serializedOutput.length <= MEMORY_OUTPUT_LENGTH) {
    await rememberSessionResearch(evidence);
    return;
  }

  reportActivity({
    type: 'progress',
    phase: 'process',
    message: `正在压缩 ${evidence.toolName} 的调研结果以写入 Session memory`,
  });
  const result = await compress(evidence);
  await rememberSessionResearch({ ...evidence, output: result.text });
  reportCompressionUsage(result.usage, reportActivity);
}