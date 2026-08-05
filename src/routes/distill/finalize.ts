import type {
  ArchiveClassification,
  DeepResearchArtifact,
  LlmTokenUsage,
} from '../../types';
import { config } from '../../config/env';
import {
  buildReminderTitle,
  syncToAppleReminders,
} from '../../services/reminders';
import { saveObsidianArtifactBundle } from '../../services/obsidian-artifacts';
import { getOrCreateSessionArtifactDirectoryPath } from '../../services/session-artifact-directory';
import { join } from 'path';

export type FinalizeWriteResult = {
  readonly directoryPath: string;
  readonly mainLink: string;
};

export async function runFinalizeWritePipeline(opts: {
  sessionId: string;
  title: string;
  markdown: string;
  milestone: string;
  rawText: string;
  transcript: string;
  archive: ArchiveClassification;
  researchArtifacts: readonly DeepResearchArtifact[];
  tokenUsage: LlmTokenUsage;
}): Promise<FinalizeWriteResult> {
  const {
    sessionId,
    title,
    markdown,
    milestone,
    rawText,
    transcript,
    archive,
    researchArtifacts,
    tokenUsage,
  } = opts;
  const now = new Date();
  const directoryPath = await getOrCreateSessionArtifactDirectoryPath(sessionId, title, now);
  const vaultPath = join(config.obsidianVaultPath, directoryPath);

  const bundle = await saveObsidianArtifactBundle({
    sessionId,
    directoryPath,
    vaultPath,
    title,
    markdown: [
      markdown,
      '',
      '## 原始意识流记录',
      '',
      rawText,
      '',
      '## 对话记录',
      '',
      transcript,
      '',
      '## Token 消耗',
      '',
      `- Input: ${tokenUsage.inputTokens}`,
      `- Output: ${tokenUsage.outputTokens}`,
      `- Total: ${tokenUsage.totalTokens}`,
    ].join('\n'),
    milestone,
    category: archive.category,
    subcategory: archive.subcategory,
    tags: archive.tags,
    researchArtifacts,
    now,
  });

  if (milestone) {
    try {
      await syncToAppleReminders(buildReminderTitle({
        milestoneTitle: milestone,
        obsidianTitle: title,
      }));
    } catch (error) {
      console.error('[reminders] Error syncing reminder:', error);
    }
  }

  return {
    directoryPath: bundle.directoryPath,
    mainLink: bundle.mainLink,
  };
}
