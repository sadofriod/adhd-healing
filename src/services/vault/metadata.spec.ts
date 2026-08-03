import { describe, expect, it } from 'bun:test';
import { buildArchiveMetadata, parseFrontMatter } from './metadata';

describe('parseFrontMatter', () => {
  it('parses archive front matter into structured data', () => {
    const content = `---
title: "想法标题"
date: 2026-07-29T10:11:12.123Z
category: "AI工作流"
subcategory: "提示词工程"
summary: "摘要"
tags: ["AI","提示词"]
---

Body`;

    const parsed = parseFrontMatter(content);

    expect(parsed).toEqual({
      title: '想法标题',
      date: '2026-07-29T10:11:12.123Z',
      category: 'AI工作流',
      subcategory: '提示词工程',
      summary: '摘要',
      tags: ['AI', '提示词'],
    });
  });
});

describe('buildArchiveMetadata', () => {
  it('falls back to the filename when front matter is missing', () => {
    const metadata = buildArchiveMetadata('/tmp/example.md', 'example.md', null);

    expect(metadata.title).toBe('example');
    expect(metadata.category).toBe('uncategorized');
    expect(metadata.subcategory).toBe('general');
  });
});
