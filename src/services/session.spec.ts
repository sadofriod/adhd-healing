import { afterEach, describe, expect, test } from 'bun:test';
import {
  addSessionTokenUsage,
  appendToSession,
  clearSession,
  getSession,
  getSessionResearchMemory,
  getSessionTokenUsage,
  prepareUserTurn,
  resetSession,
  rememberSessionResearch,
} from './session';

afterEach(clearSession);

describe('session token usage', () => {
  test('accumulates usage and resets it for a new session', () => {
    addSessionTokenUsage({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    addSessionTokenUsage({ inputTokens: 50, outputTokens: 10, totalTokens: 60 });

    expect(getSessionTokenUsage()).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      totalTokens: 180,
    });

    resetSession();

    expect(getSessionTokenUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});

describe('session research memory', () => {
  test('deduplicates equivalent inputs and keeps the latest output', () => {
    rememberSessionResearch({
      toolName: 'github_get_file_contents（MCP）',
      input: { repo: 'agent-company', owner: 'sadofriod' },
      output: { content: 'old' },
    });
    rememberSessionResearch({
      toolName: 'github_get_file_contents（MCP）',
      input: { owner: 'sadofriod', repo: 'agent-company' },
      output: { content: 'new' },
    });

    expect(getSessionResearchMemory()).toHaveLength(1);
    expect(getSessionResearchMemory()[0]?.output).toEqual({ content: 'new' });
  });

  test('clears research memory when the session resets', () => {
    rememberSessionResearch({
      toolName: 'browser_search（内置）',
      input: { query: '2026 agent market' },
      output: { results: [] },
    });

    resetSession();

    expect(getSessionResearchMemory()).toEqual([]);
  });
});

describe('session task resume', () => {
  test('reuses the pending user turn without appending it twice', () => {
    resetSession();
    prepareUserTurn('继续商业化分析', false);

    const resumed = prepareUserTurn('继续商业化分析', true);

    expect(resumed).toEqual([{ role: 'user', content: '继续商业化分析' }]);
  });

  test('rejects resume when the latest turn is not pending', () => {
    resetSession();
    appendToSession('user', '已有问题');
    appendToSession('assistant', '已有回答');

    expect(() => prepareUserTurn('已有问题', true)).toThrow('当前没有可恢复的暂停任务');
    expect(getSession()).toHaveLength(2);
  });
});
