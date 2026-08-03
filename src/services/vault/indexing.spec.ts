import { describe, expect, it } from 'bun:test';
import { buildArchiveIndexMarkdown } from './indexing';
import type { ArchiveMetadata } from './metadata';

describe('buildArchiveIndexMarkdown', () => {
  it('groups entries by category and subcategory for retrieval', () => {
    const entries: ArchiveMetadata[] = [
      {
        title: 'FreeCAD Rust 插件',
        date: '2026-07-30T10:00:00.000Z',
        category: 'CAD工具',
        subcategory: 'FreeCAD',
        summary: 'Rust 切片插件方向',
        tags: ['Rust', 'FreeCAD'],
        filePath: '/tmp/.local-vault/cad/freecad/a.md',
        relativePath: 'cad/freecad/a.md',
      },
      {
        title: '语音脑暴入口',
        date: '2026-07-29T10:00:00.000Z',
        category: 'AI工作流',
        subcategory: '语音采集',
        summary: 'iPhone Shortcut 入口',
        tags: ['Shortcut', 'iPhone'],
        filePath: '/tmp/.local-vault/ai/voice/b.md',
        relativePath: 'ai/voice/b.md',
      },
    ];

    const markdown = buildArchiveIndexMarkdown(entries);

    expect(markdown).toContain('# Archive Index');
    expect(markdown).toContain('## CAD工具');
    expect(markdown).toContain('### FreeCAD');
    expect(markdown).toContain('[FreeCAD Rust 插件](./cad/freecad/a.md)');
    expect(markdown).toContain('## AI工作流');
    expect(markdown).toContain('### 语音采集');
  });
});
