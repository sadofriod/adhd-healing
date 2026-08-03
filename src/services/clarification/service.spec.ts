import { describe, expect, test } from 'bun:test';
import { resolveDecisionDraft, type DecisionGenerator } from './service';

describe('clarification progress loop', () => {
  test('allows extended internal progress until final', async () => {
    let attempts = 0;
    const generate: DecisionGenerator = async (_session, progress) => {
      attempts += 1;
      if (attempts <= 15) {
        return {
          text: JSON.stringify({
            type: 'progress',
            phase: 'sub-agent',
            message: `内部推进 ${attempts}`,
          }),
        };
      }

      expect(progress?.message).toBe('内部推进 15');
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

    expect(attempts).toBe(16);
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
      event => {
        if (event.type === 'progress') progressMessages.push(event.message);
      }
    );

    expect(progressMessages[0]).toBe('工具调用：github_get_file_contents（MCP）');
    expect(decision).toEqual({
      type: 'clarify',
      message: '你希望优先验证哪个渠道？',
    });
  });
});

describe('clarification progress safeguards', () => {
  test('excludes failed tools from subsequent progress rounds', async () => {
    let attempts = 0;
    const generate: DecisionGenerator = async (_session, _progress, excludedToolNames) => {
      attempts += 1;
      if (attempts === 1) {
        expect(excludedToolNames).toEqual(new Set());
        return {
          text: '',
          phaseHint: 'tool-call',
          toolNames: ['github_get_latest_release（MCP）'],
          toolFailures: [{
            toolName: 'github_get_latest_release',
            error: '404 Not Found',
          }],
        };
      }

      expect(excludedToolNames).toEqual(new Set(['github_get_latest_release']));
      return {
        text: '{"type":"clarify","message":"你希望先验证企业版还是开发者版？"}',
      };
    };

    const decision = await resolveDecisionDraft([], generate);

    expect(attempts).toBe(2);
    expect(decision.type).toBe('clarify');
  });
});

describe('clarification tool exchange reporting', () => {
  test('reports each tool input with its correlated output', async () => {
    const events: Array<{ operationId?: string; input?: unknown; output?: unknown }> = [];
    const generate: DecisionGenerator = async () => ({
      text: '{"type":"clarify","message":"接下来验证哪个渠道？"}',
      toolNames: ['github_get_file_contents（MCP）'],
      toolActivities: [{
        operationId: 'call-1',
        toolName: 'github_get_file_contents（MCP）',
        input: { owner: 'sadofriod', repo: 'agent-company', path: 'README.md' },
        output: { content: '# Agent Company' },
      }],
    });

    await resolveDecisionDraft([], generate, undefined, event => {
      if (event.type === 'progress' && event.operationId) events.push(event);
    });

    expect(events).toEqual([{
      type: 'progress',
      phase: 'tool-call',
      message: 'github_get_file_contents（MCP）',
      operationId: 'call-1',
      input: { owner: 'sadofriod', repo: 'agent-company', path: 'README.md' },
      output: { content: '# Agent Company' },
    }]);
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
      event => {
        if (event.type === 'progress') messages.push(event.message);
      }
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
      event => {
        if (event.type !== 'progress') return;
        reportedProgress.push({
          message: event.message,
          details: event.details,
        });
      }
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

describe('clarification token usage reporting', () => {
  test('reports token usage for every generated LLM response', async () => {
    const inputTokens: number[] = [];
    let attempts = 0;
    const generate: DecisionGenerator = async () => {
      attempts += 1;
      return {
        text: attempts === 1
          ? '{"type":"progress","phase":"process","message":"继续分析"}'
          : '{"type":"clarify","message":"下一步是什么？"}',
        tokenUsages: [
          { inputTokens: attempts * 100, outputTokens: 20, totalTokens: attempts * 100 + 20 },
          { inputTokens: attempts * 100 + 50, outputTokens: 10, totalTokens: attempts * 100 + 60 },
        ],
      };
    };

    await resolveDecisionDraft([], generate, undefined, event => {
      if (event.type === 'usage') inputTokens.push(event.usage.inputTokens);
    });

    expect(inputTokens).toEqual([100, 150, 200, 250]);
  });
});
