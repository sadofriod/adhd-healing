import type { ReminderContent } from '../utils/markdown';

export function buildReminderScript(content: ReminderContent): string {
  const notes = content.url
    ? `${content.notes}\n\n参考链接\n${content.url}`
    : content.notes;
  const properties = [
    `name: ${JSON.stringify(content.title)}`,
    `body: ${JSON.stringify(notes)}`,
    'flagged: true',
  ].filter(Boolean).join(', ');

  return [
    "var app = Application('Reminders');",
    'var list = app.defaultList();',
    `var rem = app.Reminder({ ${properties} });`,
    'list.reminders.push(rem);',
  ].join(' ');
}

async function spawnOsascript(script: string): Promise<number> {
  const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exited;
}

export async function syncToAppleReminders(content: ReminderContent): Promise<void> {
  console.log('[reminders] Adding reminder:', content.title);
  const script = buildReminderScript(content);
  const exitCode = await spawnOsascript(script);
  if (exitCode !== 0) {
    console.error('[reminders] Failed to add reminder for:', content.title);
  }
}
