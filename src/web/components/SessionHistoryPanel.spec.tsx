import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionHistoryPanel } from './SessionHistoryPanel';

describe('SessionHistoryPanel', () => {
  test('renders finished sessions with a continue action', () => {
    const markup = renderToStaticMarkup(
      <SessionHistoryPanel
        errorMessage={null}
        isLoading={false}
        intlLocale="zh-CN"
        locale="zh"
        onClose={() => undefined}
        onContinue={async () => undefined}
        sessions={[{
          id: 'session-1',
          status: 'FINISHED',
          title: '完成后继续讨论',
          activityEntries: [],
          pendingTurnInput: null,
          pendingTurn: null,
          messages: [{ role: 'user', content: '问题' }],
          tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          createdAt: '2026-08-03T00:00:00.000Z',
          updatedAt: '2026-08-03T00:00:00.000Z',
          finishedAt: '2026-08-03T00:00:00.000Z',
        }]}
      />
    );

    expect(markup).toContain('已完成');
    expect(markup).toContain('完成后继续讨论');
    expect(markup).toContain('继续会话');
  });

  test('renders english labels when locale is en', () => {
    const markup = renderToStaticMarkup(
      <SessionHistoryPanel
        errorMessage={null}
        isLoading={true}
        intlLocale="en-US"
        locale="en"
        onClose={() => undefined}
        onContinue={async () => undefined}
        sessions={[]}
      />
    );

    expect(markup).toContain('Session history');
    expect(markup).toContain('Loading...');
  });

  test('renders paused sessions distinctly when a pending turn exists', () => {
    const markup = renderToStaticMarkup(
      <SessionHistoryPanel
        errorMessage={null}
        isLoading={false}
        intlLocale="zh-CN"
        locale="zh"
        onClose={() => undefined}
        onContinue={async () => undefined}
        sessions={[{
          id: 'session-2',
          status: 'ACTIVE',
          title: '等待恢复',
          activityEntries: [],
          pendingTurnInput: '继续这个任务',
          pendingTurn: {
            text: '继续这个任务',
            attachments: [],
          },
          messages: [{ role: 'user', content: '继续这个任务' }],
          tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          createdAt: '2026-08-03T00:00:00.000Z',
          updatedAt: '2026-08-03T00:00:00.000Z',
          finishedAt: null,
        }]}
      />
    );

    expect(markup).toContain('已暂停');
    expect(markup).toContain('等待恢复');
  });
});