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

  test('keeps correcting invalid output without a fixed attempt limit', async () => {
    let attempts = 0;
    const results = await runDeepResearch({
      topics: [topics[1]!],
      mainTitle: '主报告',
      mainMarkdown: '# 脑暴归档',
      sessionMessages: [],
    }, async input => {
      attempts += 1;
      if (attempts <= 6) return 'invalid';
      return buildResult(input.topic.title);
    });

    expect(attempts).toBe(7);
    expect(results).toHaveLength(1);
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
