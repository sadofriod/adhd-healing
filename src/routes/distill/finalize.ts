import { saveToLocalVault } from '../../services/vault.js';
import { syncToAppleReminders } from '../../services/reminders.js';

export async function runFinalizeWritePipeline(opts: {
  title: string;
  markdown: string;
  milestone: string;
}): Promise<void> {
  const { title, markdown, milestone } = opts;

  await saveToLocalVault(title, markdown, '');

  if (milestone) {
    try {
      await syncToAppleReminders(milestone, markdown.slice(0, 200));
    } catch (error) {
      console.error('[reminders] Error syncing reminder:', error);
    }
  }
}
