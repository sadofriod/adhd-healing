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

  test('marks a clarify response that only narrates progress', () => {
    const decision = parseDecision(JSON.stringify({
      type: 'clarify',
      message: '我已经掌握了足够信息，现在等待用户对关键分叉的回答。',
    }));

    expect(decision).toEqual({
      type: 'progress',
      phase: 'process',
      message: '我已经掌握了足够信息，现在等待用户对关键分叉的回答。',
    });
  });

  test('marks an unstructured tool-call statement', () => {
    const decision = parseDecision('让我先调用搜索工具确认竞品情况。');

    expect(decision).toEqual({
      type: 'progress',
      phase: 'tool-call',
      message: '让我先调用搜索工具确认竞品情况。',
    });
  });

  test('marks an unstructured sub-agent statement', () => {
    const decision = parseDecision('接下来启动 sub-agent 深度调研许可证边界。');

    expect(decision).toEqual({
      type: 'progress',
      phase: 'sub-agent',
      message: '接下来启动 sub-agent 深度调研许可证边界。',
    });
  });

  test('uses the AI SDK tool hint for an empty model response', () => {
    const decision = parseDecision('   ');

    expect(decision).toEqual({
      type: 'progress',
      phase: 'process',
      message: '模型尚未形成可交付决策',
    });

    expect(parseDecision('', 'tool-call')).toEqual({
      type: 'progress',
      phase: 'tool-call',
      message: '工具步骤已执行，继续形成业务决策',
    });
  });
});

describe('parseDecision final research topics', () => {
  test('parses final decisions with multiple research topics', () => {
    const decision = parseDecision(JSON.stringify({
      type: 'final',
      message: '已形成执行方案',
      markdown: '# 脑暴归档',
      milestone: '验证首个方案',
      title: 'Agent 商业化',
      researchTopics: [
        {
          title: 'AGPL 商业边界执行指南',
          scope: '研究 AGPL 与托管 SaaS 的边界',
          relevance: '决定开源和商业版本的能力划分',
          executionGoal: '形成许可证选择与仓库改造清单',
        },
        {
          title: '多租户数据隔离落地',
          scope: '研究现有 Prisma 模型的租户隔离改造',
          relevance: '直接影响 SaaS 计费和数据安全',
          executionGoal: '输出可分阶段实施的数据迁移步骤',
        },
      ],
    }));

    expect(decision.type).toBe('final');
    if (decision.type !== 'final') return;
    expect(decision.researchTopics).toHaveLength(2);
    expect(decision.researchTopics[0]?.title).toBe('AGPL 商业边界执行指南');
  });

  test('defaults final decisions to no research topics', () => {
    const decision = parseDecision(JSON.stringify({
      type: 'final',
      message: '已完成',
      markdown: '# 脑暴归档',
      milestone: '验证方案',
      title: '简单方案',
    }));

    expect(decision.type).toBe('final');
    if (decision.type !== 'final') return;
    expect(decision.researchTopics).toEqual([]);
  });
});