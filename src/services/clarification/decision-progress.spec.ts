import { describe, expect, test } from 'bun:test';
import type { LlmClarifyDecision, LlmProgressDecision } from '../../types';
import {
  attachToolNames,
  createDecisionGeneration,
  reportGenerationToolUsage,
} from './decision-progress';
import type { ToolActivity, ToolFailure } from './tool-usage';

describe('decision progress helpers', () => {
  test('creates tool-call metadata when tool names are present', () => {
    const generation = createDecisionGeneration(
      'result',
      ['browser_search（内置）'],
      [],
      [],
      [{ inputTokens: 10, outputTokens: 5, totalTokens: 15 }]
    );

    expect(generation).toEqual({
      text: 'result',
      phaseHint: 'tool-call',
      toolActivities: [],
      toolNames: ['browser_search（内置）'],
      toolFailures: [],
      tokenUsages: [{ inputTokens: 10, outputTokens: 5, totalTokens: 15 }],
    });
  });

  test('attaches tool progress details to progress decisions', () => {
    const progress: LlmProgressDecision = {
      type: 'progress',
      phase: 'process',
      message: '正在分析上下文',
    };
    const failures: ToolFailure[] = [{ toolName: 'github_get_repo', error: '404 Not Found' }];

    const next = attachToolNames(progress, ['github_get_repo（MCP）'], failures);

    expect(next).toEqual({
      type: 'progress',
      phase: 'tool-call',
      message: '工具调用：github_get_repo（MCP）',
      details: '正在分析上下文。失败工具（后续不要重试）：github_get_repo: 404 Not Found',
    });
  });

  test('reports tool activities before fallback terminal tool names', () => {
    const events: LlmProgressDecision[] = [];
    const decision: LlmClarifyDecision = { type: 'clarify', message: '继续确认' };
    const activities: ToolActivity[] = [{
      operationId: 'op-1',
      toolName: 'browser_search（内置）',
      input: { query: 'adhd' },
      output: { result: 'ok' },
    }];

    reportGenerationToolUsage(decision, {
      text: 'done',
      toolActivities: activities,
      toolNames: ['browser_search（内置）'],
    }, event => {
      if (event.type !== 'progress') return;
      events.push(event);
    });

    expect(events).toEqual([{ 
      type: 'progress',
      phase: 'tool-call',
      message: 'browser_search（内置）',
      operationId: 'op-1',
      input: { query: 'adhd' },
      output: { result: 'ok' },
    }]);
  });
});
