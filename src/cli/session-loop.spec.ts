import { describe, expect, test } from 'bun:test';
import type { DistillRequest, LlmActivityReporter, SessionHistoryItem } from '../types';
import { parseSessionLoopCommand, runSessionLoop } from './session-loop';
import type { TerminalIo } from './terminal-io';

type FakeIo = TerminalIo & {
  readonly lines: string[];
};

function createFakeIo(inputs: string[]): FakeIo {
  const queue = [...inputs];
  const lines: string[] = [];

  return {
    lines,
    readLine: async () => queue.shift() ?? '/exit',
    writeLine: line => {
      lines.push(line);
    },
    close: () => undefined,
  };
}

function createSession(id: string, title: string): SessionHistoryItem {
  return {
    id,
    title,
    status: 'FINISHED',
    messages: [],
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    finishedAt: '2026-08-04T00:00:00.000Z',
  };
}

describe('parseSessionLoopCommand', () => {
  test('parses switch command', () => {
    expect(parseSessionLoopCommand('/switch 2')).toEqual({ name: 'switch', argument: '2' });
  });

  test('ignores plain user message', () => {
    expect(parseSessionLoopCommand('hello')).toBeNull();
  });
});

describe('runSessionLoop', () => {
  test('supports history and switch by index', async () => {
    const io = createFakeIo(['/history', '/switch 2', '/exit']);
    const activated: string[] = [];
    const sessions = [
      createSession('session-1', 'first'),
      createSession('session-2', 'second'),
    ];

    await runSessionLoop(
      { io },
      {
        resetSession: async () => undefined,
        listSessionHistory: async () => sessions,
        activateSession: async sessionId => {
          activated.push(sessionId);
          return true;
        },
        runDistill: async () => ({ status: 'CONTINUE', sessionId: 'session-2', text: 'ignored' }),
      }
    );

    expect(activated).toEqual(['session-2']);
    expect(io.lines.join('\n')).toContain('History sessions:');
  });

  test('resumes paused turn with /continue', async () => {
    const io = createFakeIo(['first ask', '/continue', '/exit']);
    const calls: DistillRequest[] = [];

    await runSessionLoop(
      { io },
      {
        resetSession: async () => undefined,
        listSessionHistory: async () => [],
        activateSession: async () => true,
        runDistill: async (request: DistillRequest, _report: LlmActivityReporter) => {
          calls.push(request);
          if (request.resume) return { status: 'CONTINUE', sessionId: 'session-3', text: 'resumed' };
          return { status: 'PAUSED', sessionId: 'session-3', text: 'network interrupted' };
        },
      }
    );

    expect(calls).toEqual([
      { text: 'first ask', reset: false },
      { text: 'first ask', reset: false, resume: true, sessionId: 'session-3' },
    ]);
  });

  test('starts with new session when requested', async () => {
    const io = createFakeIo(['/exit']);
    let resetCount = 0;

    await runSessionLoop(
      { io, startNewSession: true },
      {
        resetSession: async () => {
          resetCount += 1;
        },
        listSessionHistory: async () => [],
        activateSession: async () => true,
        runDistill: async () => ({ status: 'CONTINUE', sessionId: 'session-4', text: 'ok' }),
      }
    );

    expect(resetCount).toBe(1);
  });
});
