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
    });
  });
});
