import type { ArchiveClassification } from '../../types.js';
import { syncToAppleReminders } from '../../services/reminders.js';
import {
  archiveConversation,
  saveToLocalVault,
} from '../../services/vault.js';

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
