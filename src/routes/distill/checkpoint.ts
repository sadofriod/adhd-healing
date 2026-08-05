import type { LlmClarifyDecision, LlmNoteDecision, LlmProgressDecision } from '../../types';
import { config } from '../../config/env';
import { writeObsidianNote } from '../../services/obsidian-writer';
import { buildVaultFilename } from '../../services/vault/filename';

type SessionMessage = {
  readonly role: 'user' | 'assistant';
  readonly content: string;
};

export type DistillCheckpointDecision = LlmClarifyDecision | LlmNoteDecision | LlmProgressDecision;

export type DistillCheckpointInput = {
  readonly decision: DistillCheckpointDecision;
  readonly session: readonly SessionMessage[];
  readonly now?: Date;
};

function getSessionTopic(session: readonly SessionMessage[]): string {
  const firstUserMessage = session.find(message => message.role === 'user')?.content.trim();
  if (!firstUserMessage) return 'untitled-session';
  return firstUserMessage.slice(0, 30);
}

function getCheckpointPath(topic: string, now: Date): string {
  const filename = buildVaultFilename(`${topic}-checkpoint`, now);
  return `.local-vault/_session-checkpoints/${filename}`;
}

function getDecisionLabel(decision: DistillCheckpointDecision): string {
  if (decision.type === 'clarify') return 'clarify';
  if (decision.type === 'note') return 'note';
  return `progress:${decision.phase}`;
}

function buildCheckpointContent(
  decision: DistillCheckpointDecision,
  session: readonly SessionMessage[],
  now: Date
): string {
  return [
    '# 阶段性结论',
    '',
    `- 时间: ${now.toISOString()}`,
    `- 决策类型: ${getDecisionLabel(decision)}`,
    `- 当前结论: ${decision.message}`,
    '',
    '## 当前会话片段',
    '',
    ...session.slice(-6).map(message => (
      `- ${message.role === 'user' ? '用户' : '助手'}: ${message.content}`
    )),
  ].join('\n');
}

export async function persistDistillCheckpoint(
  input: DistillCheckpointInput,
  writeNote: typeof writeObsidianNote = writeObsidianNote
): Promise<void> {
  const now = input.now ?? new Date();
  const topic = getSessionTopic(input.session);
  const path = getCheckpointPath(topic, now);
  const content = buildCheckpointContent(input.decision, input.session, now);
  const result = await writeNote(path, content, { vaultPath: config.brainVaultPath });
  console.log(`[distill] 阶段性结论已写入 ${result.backend.toUpperCase()}: ${path}`);
}