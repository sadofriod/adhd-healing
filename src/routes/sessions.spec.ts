import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  appendToSession,
  deleteSessionHistory,
  listSessionHistory,
  markSessionFinished,
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
    await markSessionFinished();

    const response = await handleSessions(new Request('http://localhost/sessions'));
    const sessions = await response.json();

    expect(response.status).toBe(200);
    expect(sessions).toMatchObject([{
      status: 'FINISHED',
      title: '继续完善产品方案',
      messages: [
        { role: 'user', content: '继续完善产品方案' },
        { role: 'assistant', content: '先确认目标用户。' },
      ],
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
});