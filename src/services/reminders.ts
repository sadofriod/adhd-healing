export type MinimalReminderInput = {
  readonly milestoneTitle: string;
  readonly obsidianTitle: string;
  readonly now?: Date;
};

export function isReminderSyncEnabled(value: string | undefined): boolean {
  if (!value) return false;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  return false;
}

export function buildReminderTitle(input: MinimalReminderInput): string {
  const now = input.now ?? new Date();
  const time = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `⚡️ [${time}] ${input.milestoneTitle} -> 见 Obsidian [[${input.obsidianTitle}]]`;
}

export function buildReminderScript(title: string): string {
  return [
    "var app = Application('Reminders');",
    'var list = app.defaultList();',
    `var rem = app.Reminder({ name: ${JSON.stringify(title)} });`,
    'list.reminders.push(rem);',
  ].join(' ');
}

async function spawnOsascript(script: string): Promise<void> {
  const proc = Bun.spawn(['osascript', '-l', 'JavaScript', '-e', script], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`osascript exited with code ${exitCode}: ${stderr.trim()}`);
  }
}

export async function syncToAppleReminders(title: string): Promise<void> {
  const enabled = isReminderSyncEnabled(Bun.env.REMINDERS_SYNC_ENABLED);
  if (!enabled) {
    console.log('[reminders] Reminder sync is disabled; skipping reminder creation.');
    return;
  }

  console.log('[reminders] Adding reminder:', title);
  await spawnOsascript(buildReminderScript(title));
}
