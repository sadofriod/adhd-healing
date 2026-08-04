import { History, MessageCircleMore, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ConversationTimeline } from './components/ConversationTimeline';
import { LlmProgressPanel } from './components/LlmProgressPanel';
import { SessionHistoryPanel } from './components/SessionHistoryPanel';
import { TextComposer } from './components/TextComposer';
import { ToolCrashPanel } from './components/ToolCrashPanel';
import { useDistillSession } from './hooks/useDistillSession';
import { useSessionHistory } from './hooks/useSessionHistory';
import { collectToolCrashes } from './tool-crash';
import type { SessionHistoryItem } from '../types';

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
  history: ReturnType<typeof useSessionHistory>,
  onClose: () => void,
  onContinue: (session: SessionHistoryItem) => Promise<void>
): JSX.Element | null {
  if (!isOpen) return null;
  return (
    <SessionHistoryPanel
      errorMessage={history.errorMessage}
      isLoading={history.isLoading}
      onClose={onClose}
      onContinue={onContinue}
      sessions={history.sessions}
    />
  );
}

function renderResumeAction(
  isPaused: boolean,
  resumeTask: () => Promise<void>
): JSX.Element | null {
  if (!isPaused) return null;
  return (
    <button className="resume-action" onClick={() => void resumeTask()} type="button">
      继续执行暂停的任务
    </button>
  );
}

export function App(): JSX.Element {
  const {
    conversation,
    errorMessage,
    executionStatus,
    loadSession,
    progressEntries,
    resetSession,
    resumeTask,
    submitText,
  } = useDistillSession();
  const history = useSessionHistory();
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const isSubmitting = executionStatus === 'running';
  const isPaused = executionStatus === 'paused';
  const crashEvents = useMemo(
    () => collectToolCrashes(progressEntries, errorMessage),
    [progressEntries, errorMessage]
  );

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
          <p className="app-name">Idea Distiller</p>
          <p className="app-subtitle">把想法聊成下一步行动</p>
        </div>
      </header>
      <main className={getWorkspaceClassName(isHistoryOpen)}>
        {renderHistoryPanel(
          isHistoryOpen,
          history,
          () => setIsHistoryOpen(false),
          continueSession
        )}
        <section className="conversation-workspace">
          <header className="workspace-header">
            <div>
              <span className="workspace-kicker">Conversation</span>
              <h1>持续澄清</h1>
            </div>
            <div className="workspace-actions">
              <button className="icon-button" onClick={() => void openHistory()} title="历史会话" type="button">
                <History aria-hidden="true" size={19} />
              </button>
              <button className="icon-button" onClick={startNewSession} title="新会话" type="button">
                <Plus aria-hidden="true" size={20} />
              </button>
            </div>
          </header>
          <div className="conversation-scroll" aria-live="polite">
            <ConversationTimeline entries={conversation.entries} />
            <LlmProgressPanel entries={progressEntries} status={executionStatus} />
          </div>
          <ToolCrashPanel crashes={crashEvents} />
          <p className={getErrorBannerClassName(errorMessage)}>{String(errorMessage ?? '')}</p>
          {renderResumeAction(isPaused, resumeTask)}
          <TextComposer
            disabled={isComposerDisabled(isSubmitting, isPaused)}
            prompt={conversation.prompt}
            onSubmit={submitText}
          />
        </section>
      </main>
    </div>
  );
}
