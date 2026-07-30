import type { JSX } from 'react';
import { AudioComposer } from './components/AudioComposer.js';
import { ConversationTimeline } from './components/ConversationTimeline.js';
import { CurrentPromptCard } from './components/CurrentPromptCard.js';
import { FinalMarkdownPanel } from './components/FinalMarkdownPanel.js';
import { TextComposer } from './components/TextComposer.js';
import { useDistillSession } from './hooks/useDistillSession.js';

function getComposerDisabled(isSubmitting: boolean, isComplete: boolean): boolean {
  return [isSubmitting, isComplete].some(Boolean);
}

function getErrorBannerClassName(errorMessage: string | null): string {
  return errorMessage ? 'error-banner' : 'error-banner is-hidden';
}

function getResetButtonClassName(isComplete: boolean): string {
  return isComplete ? 'secondary-button reset-button' : 'secondary-button reset-button is-hidden';
}

export function App(): JSX.Element {
  const {
    conversation,
    errorMessage,
    isSubmitting,
    resetSession,
    submitAudio,
    submitText,
  } = useDistillSession();
  const isComplete = conversation.finalResponse !== null;
  const isComposerDisabled = getComposerDisabled(isSubmitting, isComplete);
  const errorBannerClassName = getErrorBannerClassName(errorMessage);
  const resetButtonClassName = getResetButtonClassName(isComplete);

  return (
    <div className="app-shell">
      <div className="ambient-orb ambient-orb-left" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-right" aria-hidden="true" />
      <header className="hero-card panel-surface">
        <p className="eyebrow">Local-first idea distillation</p>
        <h1>把 iPhone 入口改成一个可对话的网页。</h1>
        <p className="hero-copy">
          同一个页面里支持文字倾倒和录音上传，服务端继续负责多轮澄清、知识沉淀和
          Reminders 同步。
        </p>
      </header>

      <main className="layout-grid">
        <section className="left-column">
          <CurrentPromptCard
            prompt={conversation.prompt}
            sessionId={conversation.sessionId}
            isBusy={isSubmitting}
            isComplete={isComplete}
          />

          <p className={errorBannerClassName}>{errorMessage ?? ''}</p>

          <div className="composer-grid">
            <TextComposer
              disabled={isComposerDisabled}
              prompt={conversation.prompt}
              onSubmit={submitText}
            />
            <AudioComposer
              disabled={isComposerDisabled}
              onSubmit={submitAudio}
            />
          </div>

          <button className={resetButtonClassName} disabled={!isComplete} onClick={resetSession} type="button">
            开始新一轮蒸馏
          </button>
        </section>

        <aside className="right-column">
          <ConversationTimeline
            entries={conversation.entries}
            sessionId={conversation.sessionId}
          />
          <FinalMarkdownPanel response={conversation.finalResponse} />
        </aside>
      </main>
    </div>
  );
}