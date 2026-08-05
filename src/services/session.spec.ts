import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  addSessionTokenUsage,
  activateSession,
  appendToSession,
  clearSession,
  deleteSessionHistory,
  flushSessionPersistence,
  getSessionActivityEntries,
  getCurrentSessionId,
  getSession,
  getSessionResearchMemory,
  getSessionTokenUsage,
  listSessionHistory,
  markSessionFinished,
  prepareUserTurn,
  recordSessionActivity,
  resetSession,
  rememberSessionResearch,
  runWithSessionContext,
} from './session';
import { database } from './database';

beforeEach(deleteSessionHistory);
afterEach(deleteSessionHistory);

describe('session token usage', () => {
  test('accumulates usage and resets it for a new session', async () => {
    await runWithSessionContext(async () => {
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
  test('keeps an earlier async turn isolated from a later session reset', async () => {
    let releaseFirstTurn!: () => void;
    const firstTurnGate = new Promise<void>(resolve => {
      releaseFirstTurn = resolve;
    });
    const firstSessionMessages: Array<{ role: 'user' | 'assistant'; content: string }>[] = [];
    const secondSessionMessages: Array<{ role: 'user' | 'assistant'; content: string }>[] = [];

    const firstTurn = runWithSessionContext(async () => {
      await resetSession();
      await prepareUserTurn('第一次会话', false);
      await firstTurnGate;
      await appendToSession('assistant', '第一次回答');

      firstSessionMessages.push([...getSession()]);
    });

    const secondTurn = runWithSessionContext(async () => {
      await resetSession();
      await prepareUserTurn('第二次会话', false);
      releaseFirstTurn();
      secondSessionMessages.push([...getSession()]);
    });

    await Promise.all([firstTurn, secondTurn]);

    expect(firstSessionMessages[0]).toEqual([
      { role: 'user', content: '第一次会话' },
      { role: 'assistant', content: '第一次回答' },
    ]);
    expect(secondSessionMessages[0]).toEqual([{ role: 'user', content: '第二次会话' }]);
  });

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
  test('lists the pending turn input for paused sessions', async () => {
    await resetSession();
    await prepareUserTurn('展开后的输入', false, {
      text: '等待恢复的输入',
      attachments: [{
        name: 'notes.md',
        content: '# attachment',
        mimeType: 'text/markdown',
        size: 12,
      }],
    });
    await flushSessionPersistence();

    const [session] = await listSessionHistory();

    expect(session?.pendingTurnInput).toBe('等待恢复的输入');
    expect(session?.pendingTurn).toEqual({
      text: '等待恢复的输入',
      attachments: [{
        name: 'notes.md',
        content: '# attachment',
        mimeType: 'text/markdown',
        size: 12,
      }],
    });
  });

  test('starts a fresh session in a new runtime without inheriting prior memory', async () => {
    let previousSessionId = '';

    await runWithSessionContext(async () => {
      await resetSession();
      await prepareUserTurn('旧会话问题', false);
      await appendToSession('assistant', '旧会话回答');
      await rememberSessionResearch({
        toolName: 'browser_search',
        input: { query: 'leaky session' },
        output: { result: 'stale memory' },
      });
      await flushSessionPersistence();
      previousSessionId = getCurrentSessionId() ?? '';
    });

    await runWithSessionContext(async () => {
      await prepareUserTurn('新会话问题', false);

      expect(getCurrentSessionId()).not.toBe(previousSessionId);
      expect(getSession()).toEqual([{ role: 'user', content: '新会话问题' }]);
      expect(getSessionResearchMemory()).toEqual([]);
    });
  });

  test('reloads messages and research memory from SQLite', async () => {
    await resetSession();
    await prepareUserTurn('持久化问题', false);
    recordSessionActivity({
      type: 'progress',
      phase: 'process',
      message: '已开始处理本轮输入',
    });
    recordSessionActivity({
      type: 'usage',
      source: '澄清决策',
      usage: { inputTokens: 320, outputTokens: 48, totalTokens: 368 },
      estimatedCostUsd: 0.00010976,
    });
    await appendToSession('assistant', '持久化回答');
    await rememberSessionResearch({
      toolName: 'browser_search',
      input: { query: 'SQLite' },
      output: { result: 'stored' },
    });
    await flushSessionPersistence();

    const sessionId = getCurrentSessionId();
    clearSession();
    if (!sessionId) throw new Error('Expected a session id');
    await activateSession(sessionId);
    await prepareUserTurn('继续追问', false);

    expect(getSession()).toEqual([
      { role: 'user', content: '持久化问题' },
      { role: 'assistant', content: '持久化回答' },
      { role: 'user', content: '继续追问' },
    ]);
    expect(getSessionActivityEntries()).toEqual([
      {
        type: 'progress',
        phase: 'process',
        message: '已开始处理本轮输入',
      },
      {
        type: 'usage',
        source: '澄清决策',
        usage: { inputTokens: 320, outputTokens: 48, totalTokens: 368 },
        estimatedCostUsd: 0.00010976,
      },
    ]);
    expect(getSessionResearchMemory()[0]?.output).toEqual({ result: 'stored' });
  });

  test('continues a finished session without creating a new session', async () => {
    await resetSession();
    await prepareUserTurn('第一轮问题', false);
    await appendToSession('assistant', '第一轮完成');
    await markSessionFinished();
    const sessionId = getCurrentSessionId();
    clearSession();

    if (!sessionId) throw new Error('Expected a session id');
    await activateSession(sessionId);
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
