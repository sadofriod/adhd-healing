import { describe, expect, it } from 'bun:test';
import { buildReminderScript } from './reminders';

describe('buildReminderScript', () => {
  it('writes structured content to matching Reminders fields', () => {
    const script = buildReminderScript({
      title: '完成第一步',
      notes: '执行步骤\n1. 启动服务',
      url: 'https://bun.sh/docs',
    });

    expect(script).toContain('name: "完成第一步"');
    expect(script).toContain('body: "执行步骤\\n1. 启动服务\\n\\n');
    expect(script).toContain('参考链接\\nhttps://bun.sh/docs"');
    expect(script).toContain('flagged: true');
    expect(script).not.toContain('url:');
  });

  it('does not add a link section when markdown has no web link', () => {
    const script = buildReminderScript({
      title: '完成第一步',
      notes: '启动服务',
    });

    expect(script).not.toContain('参考链接');
  });
});