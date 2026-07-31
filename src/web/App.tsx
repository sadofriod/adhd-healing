import type { JSX } from 'react';
import { ConversationTimeline } from './components/ConversationTimeline';
import { CurrentPromptCard } from './components/CurrentPromptCard';
import { FinalMarkdownPanel } from './components/FinalMarkdownPanel';
import { TextComposer } from './components/TextComposer';
import { useDistillSession } from './hooks/useDistillSession';

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
    submitText,
  } = useDistillSession();
  const isComplete = conversation.finalText !== null;
  const isComposerDisabled = getComposerDisabled(isSubmitting, isComplete);

  return (
    <div className="app-shell">
      <div className="ambient-orb ambient-orb-left" aria-hidden="true" />
      <div className="ambient-orb ambient-orb-right" aria-hidden="true" />
      <header className="hero-card panel-surface">
        <p className="eyebrow">Cloud-powered idea distillation</p>
        <h1>把想法蒸馏成可执行的 Milestone。</h1>
        <p className="hero-copy">
          输入你的想法，AI 会逐轮追问，直到提炼出一个 20 分钟内可执行的具体任务。
        </p>
      </header>

      <main className="layout-grid">
        <section className="left-column">
          <CurrentPromptCard
            prompt={conversation.prompt}
            isBusy={isSubmitting}
            isComplete={isComplete}
          />

          <p className={getErrorBannerClassName(errorMessage)}>{errorMessage ?? ''}</p>

          <TextComposer
            disabled={isComposerDisabled}
            prompt={conversation.prompt}
            onSubmit={submitText}
          />

          <button
            className={getResetButtonClassName(isComplete)}
            disabled={!isComplete}
            onClick={resetSession}
            type="button"
          >
            开始新一轮蒸馏
          </button>
        </section>

        <aside className="right-column">
          <ConversationTimeline entries={conversation.entries} />
          <FinalMarkdownPanel finalText={conversation.finalText} />
        </aside>
      </main>
    </div>
  );
}
