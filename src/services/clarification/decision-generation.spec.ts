import { afterEach, describe, expect, test } from 'bun:test';
import type { LlmActivityEvent } from '../../types';
import {
  deleteSessionHistory,
  getSessionResearchMemory,
  rememberSessionResearch,
  resetSession,
} from '../session';
import {
  buildDecisionAgentPrompt,
  generateDecisionText,
  recordDecisionToolActivities,
} from './decision-generation';

afterEach(deleteSessionHistory);

describe('generateDecisionText', () => {
  test('is exported as a function', () => {
    expect(typeof generateDecisionText).toBe('function');
  });
});

describe('decision generation session memory integration', () => {
  test('injects session research memory into the decision prompt', async () => {
    await resetSession();
    await rememberSessionResearch({
      toolName: 'github_get_repo（MCP）',
      input: { owner: 'sadofriod', repo: 'agent-company' },
      output: { stars: 42 },
    });

    const prompt = buildDecisionAgentPrompt([
      { role: 'user', content: '请判断商业化优先级' },
    ]);

    expect(prompt).toContain('Session 调研记忆');
    expect(prompt).toContain('github_get_repo（MCP）');
    expect(prompt).toContain('agent-company');
    expect(prompt).toContain('42');
  });

  test('stores tool outputs including failure payloads in session memory', async () => {
    await resetSession();
    const events: LlmActivityEvent[] = [];

    await recordDecisionToolActivities([
      {
        operationId: 'call-1',
        toolName: 'github_get_latest_release（MCP）',
        input: { owner: 'sadofriod', repo: 'agent-company' },
        output: { ok: false, error: '404 Not Found' },
      },
    ], event => events.push(event));

    expect(getSessionResearchMemory()).toHaveLength(1);
    expect(getSessionResearchMemory()[0]).toMatchObject({
      toolName: 'github_get_latest_release（MCP）',
      input: { owner: 'sadofriod', repo: 'agent-company' },
      output: { ok: false, error: '404 Not Found' },
    });
    expect(events.find(event => event.type === 'progress')).toMatchObject({
      type: 'progress',
      phase: 'tool-call',
      message: '澄清决策：github_get_latest_release（MCP）',
    });
  });
});
