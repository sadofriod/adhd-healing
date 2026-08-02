import { describe, expect, test } from 'bun:test';
import { resolveDecisionDraft, type DecisionGenerator } from './service';

describe('clarification progress loop', () => {
  test('continues beyond the former attempt limit until final', async () => {
    let attempts = 0;
    const generate: DecisionGenerator = async (_session, progress) => {
      attempts += 1;
      if (attempts <= 7) {
        return {
          text: JSON.stringify({
            type: 'progress',
            phase: 'sub-agent',
            message: `内部推进 ${attempts}`,
          }),
        };
      }

      expect(progress?.message).toBe('内部推进 7');
      return {
        text: JSON.stringify({
          type: 'final',
          message: '完成',
          markdown: '# 脑暴归档',
          milestone: '验证方案',
          title: '持续推进方案',
          researchTopics: [],
        }),
      };
    };

    const decision = await resolveDecisionDraft([], generate);

    expect(attempts).toBe(8);
    expect(decision.type).toBe('final');
  });

  test('uses tool activity hints as progress state', async () => {
    let attempts = 0;
    const progressMessages: string[] = [];
    const generate: DecisionGenerator = async (_session, progress) => {
      attempts += 1;
      if (attempts === 1) {
        return {
          text: '',
          phaseHint: 'tool-call',
          toolNames: ['github_get_file_contents（MCP）'],
        };
      }
      expect(progress?.phase).toBe('tool-call');
      return {
        text: '{"type":"clarify","message":"你希望优先验证哪个渠道？"}',
      };
    };

    const decision = await resolveDecisionDraft(
      [],
      generate,
      undefined,
      progress => progressMessages.push(progress.message)
    );

    expect(progressMessages[0]).toBe('工具调用：github_get_file_contents（MCP）');
    expect(decision).toEqual({
      type: 'clarify',
      message: '你希望优先验证哪个渠道？',
    });
  });

});

describe('clarification progress reporting', () => {
  test('reports tools even when the same generation returns a decision', async () => {
    const messages: string[] = [];
    const generate: DecisionGenerator = async () => ({
      text: '{"type":"clarify","message":"接下来验证哪个渠道？"}',
      toolNames: ['browser_search（内置）', 'github_get_repo（MCP）'],
    });

    await resolveDecisionDraft(
      [],
      generate,
      undefined,
      progress => messages.push(progress.message)
    );

    expect(messages).toEqual([
      '工具调用：browser_search（内置）、github_get_repo（MCP）',
      'LLM 已形成澄清问题',
    ]);
  });

  test('reports internal progress and the terminal LLM statement', async () => {
    const reportedProgress: Array<{ message: string; details?: string }> = [];
    let attempts = 0;
    const generate: DecisionGenerator = async () => {
      attempts += 1;
      if (attempts === 1) {
        return { text: '{"type":"progress","phase":"sub-agent","message":"正在调研"}' };
      }
      return { text: '{"type":"clarify","message":"你希望先验证哪个用户群？"}' };
    };

    await resolveDecisionDraft(
      [],
      generate,
      undefined,
      progress => reportedProgress.push({
        message: progress.message,
        details: progress.details,
      })
    );

    expect(reportedProgress).toEqual([
      { message: '正在调研', details: undefined },
      {
        message: 'LLM 已形成澄清问题',
        details: '你希望先验证哪个用户群？',
      },
    ]);
  });
});
