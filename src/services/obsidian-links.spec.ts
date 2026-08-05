import { describe, expect, test } from 'bun:test';
import { createWikiLinkMaterializer } from './obsidian-links';

const mainDocument = {
  title: '主报告',
  path: '2026-main.md',
  linkTarget: '2026-main',
} as const;

const researchDocument = {
  title: '许可证执行指南',
  path: '2026-main--许可证执行指南.md',
  linkTarget: '2026-main--许可证执行指南',
} as const;

describe('obsidian explicit wiki-link materialization', () => {
  test('rewrites explicit links to concrete document paths', () => {
    const materializer = createWikiLinkMaterializer({
      directoryPath: 'session-123',
      knownTargets: [mainDocument, researchDocument],
    });

    const markdown = materializer.rewriteMarkdown(
      '参考 [[许可证执行指南]]，并补齐 [[MCP 实施指南|MCP 文档]]。',
      mainDocument
    );

    expect(markdown).toContain(
      '[[2026-main--许可证执行指南|许可证执行指南]]'
    );
    expect(markdown).toContain(
      '[[MCP-实施指南|MCP 文档]]'
    );
    expect(materializer.getLinkedDocuments()).toEqual([
      {
        title: 'MCP 实施指南',
        path: 'MCP-实施指南.md',
        linkTarget: 'MCP-实施指南',
        mentions: [
          {
            sourceTitle: '主报告',
            sourceLinkTarget: '2026-main',
            excerpt: '参考 许可证执行指南，并补齐 MCP 文档。',
          },
        ],
      },
    ]);
  });

  test('reuses the same linked document across multiple note rewrites', () => {
    const materializer = createWikiLinkMaterializer({
      directoryPath: 'session-123',
      knownTargets: [mainDocument, researchDocument],
    });

    materializer.rewriteMarkdown('先看 [[MCP 实施指南]]。', mainDocument);
    const rewrittenResearch = materializer.rewriteMarkdown(
      '研究报告也引用 [[MCP 实施指南]]。',
      researchDocument
    );

    expect(rewrittenResearch).toContain(
      '[[MCP-实施指南|MCP 实施指南]]'
    );
    expect(materializer.getLinkedDocuments()).toHaveLength(1);
  });
});