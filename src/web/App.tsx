import { History, MessageCircleMore, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ConversationTimeline } from './components/ConversationTimeline';
import { LlmProgressPanel } from './components/LlmProgressPanel';
import { SessionHistoryPanel } from './components/SessionHistoryPanel';
import { TextComposer } from './components/TextComposer';
import { ToolCrashPanel } from './components/ToolCrashPanel';
import { useDistillSession } from './hooks/useDistillSession';
import { useLocale } from './hooks/useLocale';
import { useSessionHistory } from './hooks/useSessionHistory';
import { getWebMessage, type WebMessageKey } from './i18n/messages';
import { collectToolCrashes } from './tool-crash';
import type { SessionHistoryItem } from '../types';
import type { Locale } from '../i18n/locale';

function getErrorBannerClassName(errorMessage: string | null): string {
  return errorMessage ? 'error-banner' : 'error-banner is-hidden';
}

function getWorkspaceClassName(isHistoryOpen: boolean): string {
  if (isHistoryOpen) return 'workspace-card panel-surface history-is-open';
  return 'workspace-card panel-surface';
}

function isComposerDisabled(isSubmitting: boolean, isPaused: boolean): boolean {
  return [isSubmitting, isPaused].some(Boolean);
}

function renderHistoryPanel(
  isOpen: boolean,
  locale: Locale,
  intlLocale: 'zh-CN' | 'en-US',
  history: ReturnType<typeof useSessionHistory>,
  onClose: () => void,
  onContinue: (session: SessionHistoryItem) => Promise<void>
): JSX.Element | null {
  if (!isOpen) return null;
  return (
    <SessionHistoryPanel
      errorMessage={history.errorMessage}
      isLoading={history.isLoading}
      intlLocale={intlLocale}
      locale={locale}
      onClose={onClose}
      onContinue={onContinue}
      sessions={history.sessions}
    />
  );
}

function renderResumeAction(
  isPaused: boolean,
  resumeTask: () => Promise<void>,
  label: string
): JSX.Element | null {
  if (!isPaused) return null;
  return (
    <button className="resume-action" onClick={() => void resumeTask()} type="button">
      {label}
    </button>
  );
}

export function App(): JSX.Element {
  const { intlLocale, locale, toggleLocale } = useLocale();
  const t = (key: WebMessageKey): string => getWebMessage(locale, key);
  const {
    conversation,
    errorMessage,
    executionStatus,
    loadSession,
    progressEntries,
    resetSession,
    resumeTask,
    submitText,
  } = useDistillSession(locale);
  const history = useSessionHistory(locale);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const isSubmitting = executionStatus === 'running';
  const isPaused = executionStatus === 'paused';
  const crashEvents = useMemo(
    () => collectToolCrashes(progressEntries, errorMessage),
    [progressEntries, errorMessage]
  );

  useEffect(() => {
    document.documentElement.lang = intlLocale;
  }, [intlLocale]);

  async function openHistory(): Promise<void> {
    setIsHistoryOpen(true);
    await history.refresh();
  }

  async function continueSession(session: SessionHistoryItem): Promise<void> {
    const activated = await history.activate(session);
    if (!activated) return;
    loadSession(activated);
    setIsHistoryOpen(false);
  }

  function startNewSession(): void {
    resetSession();
    setIsHistoryOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark"><MessageCircleMore aria-hidden="true" size={20} /></div>
        <div>
          <p className="app-name">{t('appName')}</p>
          <p className="app-subtitle">{t('appSubtitle')}</p>
        </div>
        <button
          className="icon-button locale-toggle"
          onClick={toggleLocale}
          title={t('localeToggleTitle')}
          type="button"
        >
          {t('localeToggleLabel')}
        </button>
      </header>
      <main className={getWorkspaceClassName(isHistoryOpen)}>
        {renderHistoryPanel(
          isHistoryOpen,
          locale,
          intlLocale,
          history,
          () => setIsHistoryOpen(false),
          continueSession
        )}
        <section className="conversation-workspace">
          <header className="workspace-header">
            <div>
              <span className="workspace-kicker">{t('conversationKicker')}</span>
              <h1>{t('conversationTitle')}</h1>
            </div>
            <div className="workspace-actions">
              <button className="icon-button" onClick={() => void openHistory()} title={t('historyButtonTitle')} type="button">
                <History aria-hidden="true" size={19} />
              </button>
              <button className="icon-button" onClick={startNewSession} title={t('newSessionButtonTitle')} type="button">
                <Plus aria-hidden="true" size={20} />
              </button>
            </div>
          </header>
          <div className="conversation-scroll" aria-live="polite">
            <ConversationTimeline entries={conversation.entries} locale={locale} />
            <LlmProgressPanel entries={progressEntries} locale={locale} status={executionStatus} />
          </div>
          <ToolCrashPanel crashes={crashEvents} locale={locale} />
          <p className={getErrorBannerClassName(errorMessage)}>{String(errorMessage ?? '')}</p>
          {renderResumeAction(isPaused, resumeTask, t('resumePausedTask'))}
          <TextComposer
            disabled={isComposerDisabled(isSubmitting, isPaused)}
            locale={locale}
            prompt={conversation.prompt}
            onSubmit={submitText}
          />
        </section>
      </main>
    </div>
  );
}
