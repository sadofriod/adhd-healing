import type {
  ArchiveClassification,
  DeepResearchArtifact,
} from '../../types';
import {
  buildReminderTitle,
  syncToAppleReminders,
} from '../../services/reminders';
import { saveObsidianArtifactBundle } from '../../services/obsidian-artifacts';

export type FinalizeWriteResult = {
  readonly directoryPath: string;
  readonly mainLink: string;
};

export async function runFinalizeWritePipeline(opts: {
  title: string;
  markdown: string;
  milestone: string;
  rawText: string;
  transcript: string;
  archive: ArchiveClassification;
  researchArtifacts: readonly DeepResearchArtifact[];
}): Promise<FinalizeWriteResult> {
  const {
    title,
    markdown,
    milestone,
    rawText,
    transcript,
    archive,
    researchArtifacts,
  } = opts;

  const bundle = await saveObsidianArtifactBundle({
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
    ].join('\n'),
    milestone,
    category: archive.category,
    subcategory: archive.subcategory,
    tags: archive.tags,
    researchArtifacts,
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
