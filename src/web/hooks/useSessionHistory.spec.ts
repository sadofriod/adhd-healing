import { afterEach, describe, expect, mock, test } from 'bun:test';
import {
  activateSessionRequest,
  fetchSessionHistory,
} from './useSessionHistory';
import type { SessionHistoryItem } from '../../types';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function setFetchMock(implementation: () => Promise<Response>) {
  const fetchMock = mock(implementation);
  globalThis.fetch = Object.assign(fetchMock, { preconnect: originalFetch.preconnect });
  return fetchMock;
}

describe('session history client', () => {
  test('loads persisted sessions', async () => {
    const sessions: readonly SessionHistoryItem[] = [{
      id: 'session-1',
      status: 'FINISHED',
      title: '产品方向',
      messages: [],
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
      finishedAt: '2026-08-03T00:00:00.000Z',
    }];
    setFetchMock(async () => Response.json(sessions));

    await expect(fetchSessionHistory()).resolves.toEqual(sessions);
  });

  test('activates an encoded session id', async () => {
    const fetchMock = setFetchMock(async () => new Response(null, { status: 204 }));

    await activateSessionRequest('session/one');

    expect(fetchMock).toHaveBeenCalledWith('/sessions/session%2Fone/activate', {
      method: 'POST',
    });
  });
});