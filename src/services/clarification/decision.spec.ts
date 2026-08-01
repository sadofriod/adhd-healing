import { describe, expect, test } from 'bun:test';
import { parseDecision } from './decision';

describe('parseDecision', () => {
  test('preserves a non-empty clarify message without terminal punctuation', () => {
    const decision = parseDecision('{"type":"clarify","message":"请说明最重要的约束"}');

    expect(decision).toEqual({
      type: 'clarify',
      message: '请说明最重要的约束',
    });
  });

  test('preserves a plain-text question when structured output parsing fails', () => {
    const decision = parseDecision('你希望先验证获客渠道还是价值主张？');

    expect(decision).toEqual({
      type: 'clarify',
      message: '你希望先验证获客渠道还是价值主张？',
    });
  });

  test('retries when a clarify response only narrates progress', () => {
    const decision = parseDecision(JSON.stringify({
      type: 'clarify',
      message: '我已经掌握了足够信息，现在等待用户对关键分叉的回答。',
    }));

    expect(decision).toEqual({
      type: 'retry',
      message: '我已经掌握了足够信息，现在等待用户对关键分叉的回答。',
    });
  });

  test('retries when an unstructured response describes the next action', () => {
    const decision = parseDecision('让我再确认一下竞品情况，以便给出准确建议。');

    expect(decision.type).toBe('retry');
  });

  test('uses the default question only for an empty model response', () => {
    const decision = parseDecision('   ');

    expect(decision).toEqual({
      type: 'clarify',
      message: '先别继续铺开。现在最影响判断的那个关键约束是什么？',
    });
  });
});