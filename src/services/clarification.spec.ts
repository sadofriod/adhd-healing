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

  it('converts premature final output into a clarification question when context is sparse', () => {
    expect(
      enforceDecisionConstraints(
        {
          type: 'final',
          message: '我来直接总结',
          markdown: '### 🎯 今日灵感内核\n简短总结',
        },
        '用户: 我有一个想法'
      )
    ).toEqual({
      type: 'clarify',
      message: '你希望这个想法最终产出成什么，或者帮你解决什么问题？',
    });
  });

  it('keeps final output when the user context already covers enough decision dimensions', () => {
    expect(
      enforceDecisionConstraints(
        {
          type: 'final',
          message: '可以总结',
          markdown: '### 🎯 今日灵感内核\n完整总结',
        },
        [
          '用户: 我想做一个本地优先的记录工具，最终产出一个 Bun 服务原型。',
          '用户: 目标用户先是我自己，要求本地优先和隐私安全，这周完成第一版验证。',
        ].join('\n')
      )
    ).toEqual({
      type: 'final',
      message: '可以总结',
      markdown: '### 🎯 今日灵感内核\n完整总结',
    });
  });
});