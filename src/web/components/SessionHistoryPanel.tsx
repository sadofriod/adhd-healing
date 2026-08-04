import { MessageSquareText, Play, X } from 'lucide-react';
import type { JSX } from 'react';
import type { SessionHistoryItem } from '../../types';

type SessionHistoryPanelProps = {
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly sessions: readonly SessionHistoryItem[];
  readonly onClose: () => void;
  readonly onContinue: (session: SessionHistoryItem) => Promise<void>;
};

const STATUS_LABELS: Readonly<Record<SessionHistoryItem['status'], string>> = {
  ACTIVE: '进行中',
  FINISHED: '已完成',
  ABANDONED: '已归档',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function renderError(message: string | null): JSX.Element | null {
  if (!message) return null;
  return <p className="inline-error">{message}</p>;
}

function renderHistoryContent(
  isLoading: boolean,
  sessionItems: readonly JSX.Element[]
): JSX.Element {
  if (isLoading) return <p className="history-empty">正在读取...</p>;
  if (sessionItems.length > 0) return <ol className="history-list">{sessionItems}</ol>;
  return (
    <div className="history-empty">
      <MessageSquareText aria-hidden="true" size={24} />
      <p>还没有历史会话</p>
    </div>
  );
}

export function SessionHistoryPanel(props: SessionHistoryPanelProps): JSX.Element {
  const sessionItems = props.sessions.map(session => (
    <li className="history-item" key={session.id}>
      <div className="history-item-copy">
        <div className="history-item-meta">
          <span>{STATUS_LABELS[session.status]}</span>
          <time dateTime={session.updatedAt}>{formatDate(session.updatedAt)}</time>
        </div>
        <strong>{session.title}</strong>
        <small>{session.messages.length} 条消息 · {session.tokenUsage.totalTokens.toLocaleString()} tokens</small>
      </div>
      <button
        aria-label={`继续会话：${session.title}`}
        className="icon-button history-continue-button"
        onClick={() => void props.onContinue(session)}
        title="继续此会话"
        type="button"
      >
        <Play aria-hidden="true" size={17} />
      </button>
    </li>
  ));

  return (
    <aside className="history-panel" aria-label="历史会话">
      <header className="history-header">
        <div>
          <span className="workspace-kicker">Sessions</span>
          <h2>历史会话</h2>
        </div>
        <button className="icon-button" onClick={props.onClose} title="关闭历史" type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>
      {renderError(props.errorMessage)}
      {renderHistoryContent(props.isLoading, sessionItems)}
    </aside>
  );
}