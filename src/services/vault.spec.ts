import { describe, expect, it } from 'bun:test';
import {
  buildArchiveIndexMarkdown,
  buildVaultFilename,
  type ArchiveMetadata,
} from './vault';

describe('buildVaultFilename', () => {
  it('adds an alphabetic suffix to avoid same-title overwrites without date-number prefixes', () => {
    const first = buildVaultFilename('重复标题', new Date('2026-07-29T10:11:12.123Z'));
    const second = buildVaultFilename('重复标题', new Date('2026-07-29T10:11:12.124Z'));

    expect(first).toBe('重复标题-ohibfjzv.md');
    expect(second).toBe('重复标题-ohibfjzw.md');
  });

  it('falls back to a safe placeholder when the title sanitizes to empty', () => {
    const filename = buildVaultFilename('***', new Date('2026-07-29T10:11:12.123Z'));

    expect(filename).toBe('untitled-idea-ohibfjzv.md');
  });
});

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