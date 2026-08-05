import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  appendToSession,
  deleteSessionHistory,
  listSessionHistory,
  markSessionFinished,
  recordSessionActivity,
  resetSession,
} from '../services/session';
import { handleSessions } from './sessions';

beforeEach(deleteSessionHistory);
afterEach(deleteSessionHistory);

async function getFirstSession() {
  const [session] = await listSessionHistory();
  if (!session) throw new Error('Expected persisted session');
  return session;
}

describe('session history routes', () => {
  test('lists persisted sessions with messages and status', async () => {
    await resetSession();
    await appendToSession('user', '继续完善产品方案');
    await appendToSession('assistant', '先确认目标用户。');
    recordSessionActivity({
      type: 'progress',
      phase: 'tool-call',
      message: 'github_get_file_contents（MCP）',
      operationId: 'call-1',
      input: { path: 'README.md' },
      output: { content: '# Agent Company' },
    });
    await markSessionFinished();

    const response = await handleSessions(new Request('http://localhost/sessions'));
    const sessions = await response.json();

    expect(response.status).toBe(200);
    expect(sessions).toMatchObject([{
      status: 'FINISHED',
      title: '继续完善产品方案',
      activityEntries: [{
        type: 'progress',
        phase: 'tool-call',
        message: 'github_get_file_contents（MCP）',
        operationId: 'call-1',
        input: { path: 'README.md' },
        output: { content: '# Agent Company' },
      }],
      pendingTurnInput: null,
      pendingTurn: null,
      messages: [
        { role: 'user', content: '继续完善产品方案' },
        { role: 'assistant', content: '先确认目标用户。' },
      ],
    }]);
  });

  test('lists pending turn input for paused sessions', async () => {
    await resetSession();
    await appendToSession('user', '网络中断前的输入');

    const { database } = await import('../services/database');
    await database.session.update({
      where: { id: (await getFirstSession()).id },
      data: {
        pendingTurnJson: JSON.stringify({
          text: '网络中断前的原始输入',
          attachments: [{
            name: 'context.txt',
            content: 'supporting details',
            size: 18,
            mimeType: 'text/plain',
          }],
        }),
      },
    });

    const response = await handleSessions(new Request('http://localhost/sessions'));
    const sessions = await response.json();

    expect(response.status).toBe(200);
    expect(sessions).toMatchObject([{
      status: 'ACTIVE',
      pendingTurnInput: '网络中断前的原始输入',
      pendingTurn: {
        text: '网络中断前的原始输入',
        attachments: [{
          name: 'context.txt',
          content: 'supporting details',
          size: 18,
          mimeType: 'text/plain',
        }],
      },
    }]);
  });

  test('activates a finished session so it can continue', async () => {
    await resetSession();
    await appendToSession('user', '已结束的话题');
    await markSessionFinished();
    const session = await getFirstSession();

    const response = await handleSessions(new Request(
      `http://localhost/sessions/${session.id}/activate`,
      { method: 'POST' }
    ));
    const [activated] = await listSessionHistory();

    expect(response.status).toBe(204);
    expect(activated?.status).toBe('ACTIVE');
    expect(activated?.finishedAt).toBeNull();
  });

  test('returns localized error when session is not found', async () => {
    const response = await handleSessions(new Request('http://localhost/sessions/not-exist/activate', {
      headers: { 'x-locale': 'en' },
      method: 'POST',
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Session not found' });
  });
});