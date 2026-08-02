import { describe, expect, it } from 'bun:test';
import { buildReminderScript, buildReminderTitle } from './reminders';

describe('buildReminderScript', () => {
  it('builds a timestamped title with an Obsidian wiki-link', () => {
    const title = buildReminderTitle({
      milestoneTitle: '完成第一步',
      obsidianTitle: '本地向量网关设计',
      now: new Date('2026-08-01T07:24:00.000Z'),
    });

    expect(title).toContain('完成第一步');
    expect(title).toContain('[[本地向量网关设计]]');
    expect(title).toMatch(/⚡️ \[\d{2}:\d{2}\]/);
  });

  it('writes only the reminder name', () => {
    const script = buildReminderScript('⚡️ [15:24] 完成第一步 -> 见 Obsidian [[设计]]');

    expect(script).toContain('name: "⚡️ [15:24] 完成第一步 -> 见 Obsidian [[设计]]"');
    expect(script).not.toContain('body:');
    expect(script).not.toContain('flagged:');
  });
});