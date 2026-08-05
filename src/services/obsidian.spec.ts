import { describe, expect, it } from 'bun:test';
import { buildObsidianNote, saveToObsidian } from './obsidian';

const input = {
  title: '本地向量网关设计',
  markdown: [
    '# 脑暴归档',
    '',
    '## 💡 核心演进',
    '使用 [[Bun]] 连接 [[Obsidian]]。',
    '',
    '## 🎯 衍生双链',
    '- [[Model Context Protocol]]',
  ].join('\n'),
  milestone: '启动 MCP 网关',
  category: 'AI 工作流',
  subcategory: '本地知识库',
  tags: ['Bun', '#Obsidian'],
  now: new Date('2026-08-01T08:09:10.123Z'),
} as const;

describe('Obsidian MCP persistence', () => {
  it('builds a collision-safe note with YAML and wiki-links', () => {
    const note = buildObsidianNote(input);

    expect(note.path).toBe('本地向量网关设计-oidgkepf.md');
    expect(note.content).toContain('type: brain-distill');
    expect(note.content).toContain('milestone: "启动 MCP 网关"');
    expect(note.content).toContain('  - "Obsidian"');
    expect(note.content).toContain('category: "AI 工作流"');
    expect(note.content).toContain('subcategory: "本地知识库"');
    expect(note.content).toContain('[[Model Context Protocol]]');
    expect(note.content).not.toContain('## 🕸️ 知识图谱关系');
    expect(note.content).not.toContain('related:');
  });

  it('persists through the configured MCP write tool', async () => {
    const calls: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const execute = async (
      toolName: string,
      args: Record<string, unknown>
    ): Promise<unknown> => {
      calls.push({ toolName, args });
      return { ok: true };
    };

    const note = await saveToObsidian(input, execute);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.toolName).toBe('obsidian_create-note');
    expect(calls[0]?.args).toEqual({ path: note.path, content: note.content });
  });
});
