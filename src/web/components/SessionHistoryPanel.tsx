import { MessageSquareText, Play, X } from 'lucide-react';
import type { JSX } from 'react';
import type { Locale } from '../../i18n/locale';
import type { SessionHistoryItem } from '../../types';
import { getWebMessage } from '../i18n/messages';

type SessionHistoryPanelProps = {
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly locale: Locale;
  readonly intlLocale: 'zh-CN' | 'en-US';
  readonly sessions: readonly SessionHistoryItem[];
  readonly onClose: () => void;
  readonly onContinue: (session: SessionHistoryItem) => Promise<void>;
};

function getStatusLabel(status: SessionHistoryItem['status'], locale: Locale): string {
  if (status === 'ACTIVE') return getWebMessage(locale, 'sessionStatusActive');
  if (status === 'FINISHED') return getWebMessage(locale, 'sessionStatusFinished');
  return getWebMessage(locale, 'sessionStatusAbandoned');
}

function formatDate(value: string, intlLocale: 'zh-CN' | 'en-US'): string {
  return new Intl.DateTimeFormat(intlLocale, {
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
  sessionItems: readonly JSX.Element[],
  locale: Locale
): JSX.Element {
  if (isLoading) return <p className="history-empty">{getWebMessage(locale, 'sessionLoading')}</p>;
  if (sessionItems.length > 0) return <ol className="history-list">{sessionItems}</ol>;
  return (
    <div className="history-empty">
      <MessageSquareText aria-hidden="true" size={24} />
      <p>{getWebMessage(locale, 'sessionEmpty')}</p>
    </div>
  );
}

export function SessionHistoryPanel(props: SessionHistoryPanelProps): JSX.Element {
  const sessionItems = props.sessions.map(session => (
    <li className="history-item" key={session.id}>
      <div className="history-item-copy">
        <div className="history-item-meta">
          <span>{getStatusLabel(session.status, props.locale)}</span>
          <time dateTime={session.updatedAt}>{formatDate(session.updatedAt, props.intlLocale)}</time>
        </div>
        <strong>{session.title}</strong>
        <small>{session.messages.length} {getWebMessage(props.locale, 'sessionCountUnit')} · {session.tokenUsage.totalTokens.toLocaleString()} tokens</small>
      </div>
      <button
        aria-label={`${getWebMessage(props.locale, 'continueSessionAriaPrefix')}：${session.title}`}
        className="icon-button history-continue-button"
        onClick={() => void props.onContinue(session)}
        title={getWebMessage(props.locale, 'continueSessionTitle')}
        type="button"
      >
        <Play aria-hidden="true" size={17} />
      </button>
    </li>
  ));

  return (
    <aside className="history-panel" aria-label={getWebMessage(props.locale, 'sessionPanelAria')}>
      <header className="history-header">
        <div>
          <span className="workspace-kicker">{getWebMessage(props.locale, 'sessionsKicker')}</span>
          <h2>{getWebMessage(props.locale, 'sessionPanelTitle')}</h2>
        </div>
        <button className="icon-button" onClick={props.onClose} title={getWebMessage(props.locale, 'closeHistoryTitle')} type="button">
          <X aria-hidden="true" size={19} />
        </button>
      </header>
      {renderError(props.errorMessage)}
      {renderHistoryContent(props.isLoading, sessionItems, props.locale)}
    </aside>
  );
}