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
  it('materializes llm-chosen wiki links into real session documents', () => {
    const bundle = buildObsidianArtifactBundle({
      ...input,
      sessionId: 'cmec2n97u0000abc123def456',
      researchArtifacts: [],
      markdown: [
        '# 脑暴归档',
        '',
        '## 💡 核心演进',
        '使用 [[MCP 实施指南]] 连接 [[Obsidian 自动归档|Obsidian 自动归档]]。',
        '',
        '## 🎯 衍生双链',
        '- [[MCP 实施指南]] — 约束工具接入。',
        '- [[Obsidian 自动归档]] — 约束归档落盘。',
      ].join('\n'),
    });

    expect(bundle.mainNote.content).toContain(
      '[[Agent-商业化-doblii/MCP-实施指南|MCP 实施指南]]'
    );
    expect(bundle.mainNote.content).toContain(
      '[[Agent-商业化-doblii/Obsidian-自动归档|Obsidian 自动归档]]'
    );
    expect(bundle.linkedNotes.map(note => note.path)).toEqual([
      'Agent-商业化-doblii/MCP-实施指南.md',
      'Agent-商业化-doblii/Obsidian-自动归档.md',
    ]);
    expect(bundle.linkedNotes[0]!.content).toContain('type: brain-distill-link');
    expect(bundle.linkedNotes[0]!.content).toContain('使用 MCP 实施指南 连接 Obsidian 自动归档。');
    expect(bundle.linkedNotes[0]!.content).toContain('MCP 实施指南 — 约束工具接入。');
    expect(bundle.linkedNotes[0]!.content).not.toContain('## 待补充');
  });

  it('keeps multiple finishes from one session under one directory', () => {
    const firstBundle = buildObsidianArtifactBundle({
      ...input,
      sessionId: 'cmec2n97u0000abc123def456',
      directoryPath: 'Agent-商业化-doblii',
    });
    const secondBundle = buildObsidianArtifactBundle({
      ...input,
      title: '第二次收束',
      sessionId: 'cmec2n97u0000abc123def456',
      directoryPath: 'Agent-商业化-doblii',
      now: new Date('2026-08-01T10:07:32.300Z'),
    });

    expect(firstBundle.directoryPath).toBe('Agent-商业化-doblii');
    expect(secondBundle.directoryPath).toBe(firstBundle.directoryPath);
    expect(firstBundle.mainNote.path).toBe(
      'Agent-商业化-doblii/Agent-商业化-oidoblii.md'
    );
    expect(secondBundle.mainNote.path).toBe(
      'Agent-商业化-doblii/第二次收束-oidvygtw.md'
    );
    expect(firstBundle.researchNotes[0]!.path).toBe(
      'Agent-商业化-doblii/Agent-商业化-oidoblii--许可证执行指南.md'
    );
  });

  it('builds one directory with bidirectional main and research links', () => {
    const bundle = buildObsidianArtifactBundle(input);

    expect(bundle.directoryPath).toBe(
      'Agent-商业化-doblii'
    );
    expect(bundle.mainNote.path).toBe(
      'Agent-商业化-doblii/Agent-商业化.md'
    );
    expect(bundle.researchNotes).toHaveLength(2);
    expect(bundle.mainNote.content).toContain('children:');
    expect(bundle.mainNote.content).toContain(
      '[[Agent-商业化-doblii/许可证执行指南|许可证执行指南]]'
    );
    expect(bundle.researchNotes[0]!.content).toContain(
      'type: brain-distill-research'
    );
    expect(bundle.researchNotes[0]!.content).toContain(
      'parent: "[[Agent-商业化-doblii/Agent-商业化]]"'
    );
    expect(bundle.researchNotes[0]!.content).toContain(
      '父报告：[[Agent-商业化-doblii/Agent-商业化|Agent 商业化]]'
    );
  });

  it('keeps the main report flow when no research is needed', () => {
    const bundle = buildObsidianArtifactBundle({
      ...input,
      researchArtifacts: [],
    });

    expect(bundle.researchNotes).toEqual([]);
    expect(bundle.linkedNotes).toEqual([]);
    expect(bundle.mainNote.content).not.toContain('## 深度调研产物');
    expect(bundle.mainNote.content).not.toContain('children:');
  });

  it('uses distinct paths when sanitized artifact titles collide', () => {
    const bundle = buildObsidianArtifactBundle({
      ...input,
      sessionId: 'cmec2n97u0000abc123def456',
      researchArtifacts: [
        { ...input.researchArtifacts[0], title: '许可证/执行指南' },
        { ...input.researchArtifacts[1], title: '许可证执行指南' },
      ],
    });

    expect(bundle.researchNotes.map(note => note.path)).toEqual([
      'Agent-商业化-doblii/Agent-商业化-oidoblii--许可证执行指南.md',
      'Agent-商业化-doblii/Agent-商业化-oidoblii--许可证执行指南-2.md',
    ]);
  });

  it('writes every prepared note through MCP', async () => {
    const calls: Array<{ path: unknown; content: unknown }> = [];
    let activeWrites = 0;
    let maxActiveWrites = 0;
    const execute = async (
      _toolName: string,
      args: Record<string, unknown>
    ): Promise<unknown> => {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      calls.push({ path: args.path, content: args.content });
      await new Promise(resolve => setTimeout(resolve, 1));
      activeWrites -= 1;
      return { ok: true };
    };

    const bundle = await saveObsidianArtifactBundle(input, execute);

    expect(calls).toHaveLength(3);
    expect(calls.map(call => call.path)).toEqual([
      bundle.mainNote.path,
      ...bundle.researchNotes.map(note => note.path),
    ]);
    expect(maxActiveWrites).toBe(1);
  });
});
