import { describe, expect, it } from 'bun:test';
import { enforceDecisionConstraints, shouldForceFinalize } from './clarification.js';

describe('shouldForceFinalize', () => {
  it('allows exactly three clarification rounds before forcing final output', () => {
    expect(shouldForceFinalize(0, '用户: 我有一个新想法')).toBe(false);
    expect(shouldForceFinalize(1, '用户: 我补充一下约束')).toBe(false);
    expect(shouldForceFinalize(2, '用户: 我再补充一下成功标准')).toBe(false);
    expect(shouldForceFinalize(3, '用户: 现在开始总结')).toBe(true);
  });

  it('forces final output when the user asks to summarize immediately', () => {
    expect(shouldForceFinalize(0, '用户: 请直接总结一下')).toBe(true);
  });

  it('keeps final output decisions even when the context is sparse', () => {
    expect(
      enforceDecisionConstraints(
        {
          type: 'final',
          message: '我来直接总结',
          markdown: '### 🎯 今日灵感内核\n简短总结',
        }
      )
    ).toEqual({
      type: 'final',
      message: '我来直接总结',
      markdown: '### 🎯 今日灵感内核\n简短总结',
    });
  });

  it('normalizes malformed clarify output into a single generic question', () => {
    expect(
      enforceDecisionConstraints(
        {
          type: 'clarify',
          message: '### 先说目标\n再说用户',
        }
      )
    ).toEqual({
      type: 'clarify',
      message: '先别继续铺开。现在最影响判断的那个关键约束是什么？',
    });
  });
});