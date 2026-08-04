import type { JSX } from 'react';
import type { Locale } from '../../i18n/locale';
import { getWebMessage } from '../i18n/messages';
import type { ExecutionStatus } from '../types';

type CurrentPromptCardProps = {
  readonly prompt: string;
  readonly locale: Locale;
  readonly executionStatus: ExecutionStatus;
  readonly isComplete: boolean;
};

function getStatusLabelByExecutionStatus(executionStatus: ExecutionStatus, locale: Locale): string {
  if (executionStatus === 'running') return getWebMessage(locale, 'progressStatusRunning');
  if (executionStatus === 'paused') return getWebMessage(locale, 'progressStatusPaused');
  return getWebMessage(locale, 'sessionStatusActive');
}

function getStatusLabel(executionStatus: ExecutionStatus, isComplete: boolean, locale: Locale): string {
  if (isComplete) return getWebMessage(locale, 'sessionStatusFinished');
  return getStatusLabelByExecutionStatus(executionStatus, locale);
}

export function CurrentPromptCard(props: CurrentPromptCardProps): JSX.Element {
  const statusLabel = getStatusLabel(props.executionStatus, props.isComplete, props.locale);

  return (
    <section className="panel-surface prompt-card">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Current prompt</p>
          <h2>{getWebMessage(props.locale, 'currentPromptTitle')}</h2>
        </div>
        <span className="status-pill">{statusLabel}</span>
      </div>
      <p className="prompt-copy">{props.prompt}</p>
    </section>
  );
}
