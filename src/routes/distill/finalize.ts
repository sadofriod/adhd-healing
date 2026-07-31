import type { ArchiveClassification } from '../../types';
import { syncToAppleReminders } from '../../services/reminders';
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
      await syncToAppleReminders(milestone, markdown.slice(0, 200));
    } catch (error) {
      console.error('[reminders] Error syncing reminder:', error);
    }
  }
}
