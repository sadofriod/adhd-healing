import { describe, expect, it } from 'bun:test';
import { buildArchiveContent, buildArchiveFrontMatter, buildFileContent } from './content';

describe('buildArchiveFrontMatter', () => {
  it('serializes archive classification into front matter fields', () => {
    const date = new Date('2026-07-29T10:11:12.123Z');
    const frontMatter = buildArchiveFrontMatter(
      '测试标题',
      {
        category: 'AI工作流',
        subcategory: '提示词工程',
        summary: '简短说明',
        tags: ['AI', '提示词'],
      },
      date
    );

    expect(frontMatter).toContain('title: "测试标题"');
    expect(frontMatter).toContain('category: "AI工作流"');
    expect(frontMatter).toContain('subcategory: "提示词工程"');
    expect(frontMatter).toContain('summary: "简短说明"');
    expect(frontMatter).toContain('tags: ["AI","提示词"]');
  });
});

describe('buildArchiveContent', () => {
  it('writes transcript and raw text sections in order', () => {
    const content = buildArchiveContent(
      {
        title: '测试标题',
        finalMarkdown: '## 最终内容',
        rawText: '原始文本',
        transcript: '### 对话',
        classification: {
          category: 'AI工作流',
          subcategory: '提示词工程',
          summary: '简短说明',
          tags: ['AI'],
        },
      },
      new Date('2026-07-29T10:11:12.123Z')
    );

    expect(content).toContain('## 对话记录');
    expect(content).toContain('## 原始意识流记录');
    expect(content).toContain('原始文本');
    expect(content).toContain('### 对话');
  });
});

describe('buildFileContent', () => {
  it('prefixes markdown with front matter and raw flow record', () => {
    const content = buildFileContent('小标题', '# Hello', 'raw');

    expect(content).toContain('title: "小标题"');
    expect(content).toContain('# Hello');
    expect(content).toContain('## 原始意识流记录');
    expect(content).toContain('raw');
  });
});
