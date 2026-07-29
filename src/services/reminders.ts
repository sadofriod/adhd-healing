function buildReminderScript(taskTitle: string): string {
  const escaped = taskTitle.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return [
    "var app = Application('Reminders');",
    `var rem = app.Reminder({ name: '${escaped}' });`,
    'app.defaultList.reminders.push(rem);',
  ].join(' ');
}

async function spawnOsascript(script: string): Promise<number> {
  const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return proc.exited;
}

export async function syncToAppleReminders(taskTitle: string): Promise<void> {
  console.log('[reminders] Adding reminder:', taskTitle);
  const script = buildReminderScript(taskTitle);
  const exitCode = await spawnOsascript(script);
  if (exitCode !== 0) {
    console.error('[reminders] Failed to add reminder for:', taskTitle);
  }
}
