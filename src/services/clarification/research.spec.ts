import { describe, expect, test } from 'bun:test';
import type { DeepResearchTopic } from '../../types';
import {
  deduplicateResearchTopics,
  parseResearchArtifact,
  runDeepResearch,
} from './research';
import { getResearchSystemPrompt } from './research-agent';

const topics: readonly DeepResearchTopic[] = [
  {
    title: '许可证执行指南',
    scope: 'AGPL 与 SaaS 边界',
    relevance: '决定产品边界',
    executionGoal: '形成改造清单',
  },
  {
    title: '多租户落地',
    scope: '数据隔离',
    relevance: '支撑订阅',
    executionGoal: '形成迁移步骤',
  },
];

function buildResult(name: string): string {
  return JSON.stringify({
    markdown: [
      '# 深度调研',
      '## 执行结论',
      name,
      '## 实施步骤',
      '1. 执行',
      '## 风险与验证',
      '验证结果',
    ].join('\n'),
    summary: `${name}摘要`,
    tags: ['执行', name],
  });
}

describe('deep research parsing', () => {
  test('loads an execution-focused research prompt', () => {
    const prompt = getResearchSystemPrompt();
    expect(prompt).toContain('## 工作规则');
    expect(prompt).toContain('## 实施步骤');
    expect(prompt).toContain('不向用户追问');
    expect(prompt).not.toContain('user-invocable:');
  });

  test('deduplicates topics by normalized title', () => {
    const duplicate = { ...topics[0]!, title: ' 许可证执行指南 ' };
    expect(deduplicateResearchTopics([...topics, duplicate])).toHaveLength(2);
  });

  test('rejects reports without required execution sections', () => {
    expect(() => parseResearchArtifact('无效报告', JSON.stringify({
      markdown: '# 深度调研\n只有结论',
      summary: '不完整',
      tags: ['执行', '测试'],
    }))).toThrow();
  });

  test('preserves long sub-agent summaries without an output character limit', () => {
    const summary = '详细执行陈述'.repeat(50);

    expect(parseResearchArtifact('完整报告', JSON.stringify({
      markdown: '# 深度调研\n## 执行结论\n结论\n## 实施步骤\n步骤\n## 风险与验证\n验证',
      summary,
      tags: ['执行', '测试'],
    })).summary).toBe(summary);
  });

  test('wraps plain-text output in a research artifact', () => {
    const rawText = '# 商业化建议\n\n先补齐 License、CI 和 Release。';

    expect(parseResearchArtifact('开源商业化', rawText)).toEqual({
      title: '开源商业化',
      markdown: rawText,
      summary: '商业化建议',
      tags: ['深度调研', '开源商业化'],
    });
  });

  test('rejects empty output and invalid JSON values', () => {
    expect(() => parseResearchArtifact('空报告', '  ')).toThrow('调研输出不能为空');
    expect(() => parseResearchArtifact('空报告', 'null')).toThrow();
  });

});

describe('deep research execution', () => {
  test('runs topics concurrently while preserving topic order', async () => {
    const started: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    const resultPromise = runDeepResearch({
      topics,
      mainTitle: '主报告',
      mainMarkdown: '# 脑暴归档',
      sessionMessages: [],
    }, async input => {
      started.push(input.topic.title);
      if (input.topic.title === topics[0]?.title) await firstPending;
      return buildResult(input.topic.title);
    });

    await Bun.sleep(0);
    expect(started).toEqual(['许可证执行指南', '多租户落地']);
    releaseFirst?.();

    const results = await resultPromise;
    expect(results.map(result => result.title)).toEqual([
      '许可证执行指南',
      '多租户落地',
    ]);
  });

  test('accepts plain-text output without retrying', async () => {
    let attempts = 0;
    const results = await runDeepResearch({
      topics: [topics[1]!],
      mainTitle: '主报告',
      mainMarkdown: '# 脑暴归档',
      sessionMessages: [],
    }, async input => {
      attempts += 1;
      return `# ${input.topic.title}\n直接输出的调研正文`;
    });

    expect(attempts).toBe(1);
    expect(results[0]?.markdown).toContain('直接输出的调研正文');
  });

  test('propagates research generator failures', async () => {
    const result = runDeepResearch({
      topics: [topics[0]!],
      mainTitle: '主报告',
      mainMarkdown: '# 脑暴归档',
      sessionMessages: [],
    }, async () => {
      throw new Error('provider unavailable');
    });

    await expect(result).rejects.toThrow('provider unavailable');
  });
});

describe('deep research reporting', () => {
  test('reports plain-text output as completed without a validation retry', async () => {
    const progress: Array<{ message: string; details?: string }> = [];

    await runDeepResearch({
      topics: [topics[0]!],
      mainTitle: '主报告',
      mainMarkdown: '# 脑暴归档',
      sessionMessages: [],
    }, async () => '普通文本调研结果', event => {
      if (event.type !== 'progress') return;
      progress.push({ message: event.message, details: event.details });
    });

    expect(progress).toEqual([
      { message: '深度调研「许可证执行指南」开始第 1 轮执行', details: '形成改造清单' },
      { message: '深度调研「许可证执行指南」已完成', details: '普通文本调研结果' },
    ]);
  });
});
