import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  addSessionTokenUsage,
  appendToSession,
  clearSession,
  deleteSessionHistory,
  flushSessionPersistence,
  getSession,
  getSessionResearchMemory,
  getSessionTokenUsage,
  markSessionFinished,
  prepareUserTurn,
  resetSession,
  rememberSessionResearch,
} from './session';
import { database } from './database';

beforeEach(deleteSessionHistory);
afterEach(deleteSessionHistory);

describe('session token usage', () => {
  test('accumulates usage and resets it for a new session', async () => {
    await resetSession();
    addSessionTokenUsage({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    addSessionTokenUsage({ inputTokens: 50, outputTokens: 10, totalTokens: 60 });

    expect(getSessionTokenUsage()).toEqual({
      inputTokens: 150,
      outputTokens: 30,
      totalTokens: 180,
    });

    await resetSession();

    expect(getSessionTokenUsage()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
  });
});

describe('session research memory', () => {
  test('deduplicates equivalent inputs and keeps the latest output', async () => {
    await resetSession();
    await rememberSessionResearch({
      toolName: 'github_get_file_contents（MCP）',
      input: { repo: 'agent-company', owner: 'sadofriod' },
      output: { content: 'old' },
    });
    await rememberSessionResearch({
      toolName: 'github_get_file_contents（MCP）',
      input: { owner: 'sadofriod', repo: 'agent-company' },
      output: { content: 'new' },
    });

    expect(getSessionResearchMemory()).toHaveLength(1);
    expect(getSessionResearchMemory()[0]?.output).toEqual({ content: 'new' });
  });

  test('clears research memory when the session resets', async () => {
    await resetSession();
    await rememberSessionResearch({
      toolName: 'browser_search（内置）',
      input: { query: '2026 agent market' },
      output: { results: [] },
    });

    await resetSession();

    expect(getSessionResearchMemory()).toEqual([]);
  });
});

describe('session task resume', () => {
  test('reuses the pending user turn without appending it twice', async () => {
    await resetSession();
    await prepareUserTurn('继续商业化分析', false);

    const resumed = await prepareUserTurn('继续商业化分析', true);

    expect(resumed).toEqual([{ role: 'user', content: '继续商业化分析' }]);
  });

  test('rejects resume when the latest turn is not pending', async () => {
    await resetSession();
    await appendToSession('user', '已有问题');
    await appendToSession('assistant', '已有回答');

    await expect(prepareUserTurn('已有问题', true)).rejects.toThrow('当前没有可恢复的暂停任务');
    expect(getSession()).toHaveLength(2);
  });
});

describe('session persistence', () => {
  test('reloads messages and research memory from SQLite', async () => {
    await resetSession();
    await prepareUserTurn('持久化问题', false);
    await appendToSession('assistant', '持久化回答');
    await rememberSessionResearch({
      toolName: 'browser_search',
      input: { query: 'SQLite' },
      output: { result: 'stored' },
    });
    await flushSessionPersistence();

    clearSession();
    await prepareUserTurn('继续追问', false);

    expect(getSession()).toEqual([
      { role: 'user', content: '持久化问题' },
      { role: 'assistant', content: '持久化回答' },
      { role: 'user', content: '继续追问' },
    ]);
    expect(getSessionResearchMemory()[0]?.output).toEqual({ result: 'stored' });
  });

  test('continues a finished session without creating a new session', async () => {
    await resetSession();
    await prepareUserTurn('第一轮问题', false);
    await appendToSession('assistant', '第一轮完成');
    await markSessionFinished();
    clearSession();

    await prepareUserTurn('完成后继续讨论', false);
    await flushSessionPersistence();

    expect(await database.session.count()).toBe(1);
    expect(await database.session.findFirst()).toMatchObject({
      status: 'ACTIVE',
      finishedAt: null,
    });
    expect(getSession().at(-1)).toEqual({
      role: 'user',
      content: '完成后继续讨论',
    });
  });
});
