import { describe, expect, it } from 'bun:test';
import { buildArchiveRelativePath, buildArtifactDirectoryName, buildVaultFilename } from './filename';

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

describe('buildArchiveRelativePath', () => {
  it('normalizes category and subcategory into a portable relative path', () => {
    const path = buildArchiveRelativePath(
      {
        category: 'AI 工作流',
        subcategory: '提示词工程',
        summary: 'summary',
        tags: [],
      },
      'idea-ohibfjzv.md'
    );

    expect(path).toBe('ai-工作流/提示词工程/idea-ohibfjzv.md');
  });
});

describe('buildArtifactDirectoryName', () => {
  it('puts the title first and appends an alphabetic suffix', () => {
    const directoryName = buildArtifactDirectoryName(
      '回溯者 第一卷角色精简与文风去AI化',
      new Date('2026-08-05T03:37:15.922Z')
    );

    expect(directoryName).toBe('回溯者-第一卷角色精简与文风去AI化-eyzdtq');
  });
});
