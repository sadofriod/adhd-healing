import type { ArchiveClassification } from '../../types';
import { syncToAppleReminders } from '../../services/reminders';
import { buildReminderContent } from '../../utils/markdown';
import {
  archiveConversation,
  saveToLocalVault,
} from '../../services/vault';

export async function runFinalizeWritePipeline(opts: {
  title: string;
  markdown: string;
  milestone: string;
  rawText: string;
  transcript: string;
  archive: ArchiveClassification;
}): Promise<void> {
  const {
    title,
    markdown,
    milestone,
    rawText,
    transcript,
    archive,
  } = opts;

  await saveToLocalVault(title, markdown, rawText);
  await archiveConversation({
    title,
    finalMarkdown: markdown,
    rawText,
    transcript,
    classification: archive,
  });

  if (milestone) {
    try {
      await syncToAppleReminders(buildReminderContent(markdown, milestone));
    } catch (error) {
      console.error('[reminders] Error syncing reminder:', error);
    }
  }
}
