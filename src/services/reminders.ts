export function buildReminderScript(taskTitle: string, description: string): string {
  const safeTitle = JSON.stringify(taskTitle);
  const safeDescription = JSON.stringify(description);
  return [
    "var app = Application('Reminders');",
    'var list = app.defaultList();',
    `var rem = app.Reminder({ name: ${safeTitle}, body: ${safeDescription} });`,
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

export async function syncToAppleReminders(taskTitle: string, description: string): Promise<void> {
  console.log('[reminders] Adding reminder:', taskTitle);
  const script = buildReminderScript(taskTitle, description);
  const exitCode = await spawnOsascript(script);
  if (exitCode !== 0) {
    console.error('[reminders] Failed to add reminder for:', taskTitle);
  }
}
