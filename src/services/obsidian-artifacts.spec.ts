import { describe, expect, it } from 'bun:test';
import {
  buildObsidianArtifactBundle,
  saveObsidianArtifactBundle,
} from './obsidian-artifacts';

const input = {
  title: 'Agent 商业化',
  markdown: '# 脑暴归档\n\n## 💡 核心演进\n形成订阅闭环。',
  milestone: '确认许可证',
  category: '产品策略',
  subcategory: '开源商业化',
  tags: ['SaaS', '开源'],
  researchArtifacts: [
    {
      title: '许可证执行指南',
      markdown: '# 深度调研\n\n## 执行结论\n选择许可证。',
      summary: '形成许可证选择和改造步骤',
      tags: ['AGPL', '许可证'],
    },
    {
      title: '多租户落地',
      markdown: '# 深度调研\n\n## 执行结论\n隔离租户。',
      summary: '形成数据隔离迁移步骤',
      tags: ['Prisma', '多租户'],
    },
  ],
  now: new Date('2026-08-01T09:07:32.300Z'),
} as const;

describe('Obsidian artifact bundles', () => {
  it('builds one directory with bidirectional main and research links', () => {
    const bundle = buildObsidianArtifactBundle(input);

    expect(bundle.directoryPath).toBe(
      '2026-08-01-090732300-Agent-商业化'
    );
    expect(bundle.mainNote.path).toBe(
      '2026-08-01-090732300-Agent-商业化/Agent-商业化.md'
    );
    expect(bundle.researchNotes).toHaveLength(2);
    expect(bundle.mainNote.content).toContain('children:');
    expect(bundle.mainNote.content).toContain(
      '[[2026-08-01-090732300-Agent-商业化/许可证执行指南|许可证执行指南]]'
    );
    expect(bundle.researchNotes[0]!.content).toContain(
      'type: brain-distill-research'
    );
    expect(bundle.researchNotes[0]!.content).toContain(
      'parent: "[[2026-08-01-090732300-Agent-商业化/Agent-商业化]]"'
    );
    expect(bundle.researchNotes[0]!.content).toContain(
      '父报告：[[2026-08-01-090732300-Agent-商业化/Agent-商业化|Agent 商业化]]'
    );
  });

  it('keeps the main report flow when no research is needed', () => {
    const bundle = buildObsidianArtifactBundle({
      ...input,
      researchArtifacts: [],
    });

    expect(bundle.researchNotes).toEqual([]);
    expect(bundle.mainNote.content).not.toContain('## 深度调研产物');
    expect(bundle.mainNote.content).not.toContain('children:');
  });

  it('uses distinct paths when sanitized artifact titles collide', () => {
    const bundle = buildObsidianArtifactBundle({
      ...input,
      researchArtifacts: [
        { ...input.researchArtifacts[0], title: '许可证/执行指南' },
        { ...input.researchArtifacts[1], title: '许可证执行指南' },
      ],
    });

    expect(bundle.researchNotes.map(note => note.path)).toEqual([
      '2026-08-01-090732300-Agent-商业化/许可证执行指南.md',
      '2026-08-01-090732300-Agent-商业化/许可证执行指南-2.md',
    ]);
  });

  it('writes every prepared note through MCP', async () => {
    const calls: Array<{ path: unknown; content: unknown }> = [];
    const execute = async (
      _toolName: string,
      args: Record<string, unknown>
    ): Promise<unknown> => {
      calls.push({ path: args.path, content: args.content });
      return { ok: true };
    };

    const bundle = await saveObsidianArtifactBundle(input, execute);

    expect(calls).toHaveLength(3);
    expect(calls.map(call => call.path)).toEqual([
      bundle.mainNote.path,
      ...bundle.researchNotes.map(note => note.path),
    ]);
  });
});
