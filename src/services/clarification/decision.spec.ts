import { describe, expect, test } from 'bun:test';
import { parseDecision } from './decision';

describe('parseDecision', () => {
  test('returns a clarify decision when the model omits a final answer', () => {
    const decision = parseDecision('{"type":"clarify","message":"现在最关键的约束是什么？"}');

    expect(decision).toEqual({
      type: 'clarify',
      message: '现在最关键的约束是什么？',
    });
  });

  test('normalizes a final decision with defaults for missing fields', () => {
    const decision = parseDecision('{"type":"final","message":"已经收敛好了"}');

    expect(decision).toEqual({
      type: 'final',
      message: '已经收敛好了',
      markdown: '已经收敛好了',
      milestone: '明确 20 分钟第一步',
      title: '未命名想法',
      researchTopics: [],
    });
  });

  test('prefers the final decision when multiple JSON objects are present', () => {
    const decision = parseDecision([
      '{"type":"clarify","message":"先确认边界？"}',
      '{"type":"final","message":"可直接执行","markdown":"# 报告","milestone":"补齐 CI","title":"Open Core","researchTopics":[{"title":"许可证边界","scope":"AGPL","relevance":"影响商业化","executionGoal":"给出落地边界"}]}'
    ].join('\n\n'));

    expect(decision).toEqual({
      type: 'final',
      message: '可直接执行',
      markdown: '# 报告',
      milestone: '补齐 CI',
      title: 'Open Core',
      researchTopics: [{
        title: '许可证边界',
        scope: 'AGPL',
        relevance: '影响商业化',
        executionGoal: '给出落地边界',
      }],
    });
  });
});
