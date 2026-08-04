import type { JSX } from 'react';
import type { Locale } from '../../i18n/locale';
import type { LlmTokenUsage } from '../../types';
import { getWebMessage } from '../i18n/messages';

type FinalMarkdownPanelProps = {
  readonly finalText: string | null;
  readonly locale: Locale;
  readonly tokenUsage: LlmTokenUsage | null;
};

function getCardClassName(hasResult: boolean): string {
  if (hasResult) return 'panel-surface result-card';
  return 'panel-surface result-card result-card-empty';
}

function getStatusLabel(hasResult: boolean, locale: Locale): string {
  if (hasResult) return getWebMessage(locale, 'finalStatusReady');
  return getWebMessage(locale, 'finalStatusWaiting');
}

function ResultContent(props: {
  readonly finalText: string;
  readonly locale: Locale;
  readonly tokenUsage: LlmTokenUsage;
}): JSX.Element {
  return (
    <>
      <div className="final-token-summary">
        <strong>{getWebMessage(props.locale, 'finalUsageTitle')}</strong>
        <span>input {props.tokenUsage.inputTokens.toLocaleString()}</span>
        <span>output {props.tokenUsage.outputTokens.toLocaleString()}</span>
        <span>total {props.tokenUsage.totalTokens.toLocaleString()} tokens</span>
      </div>
      <article className="markdown-output">{props.finalText}</article>
    </>
  );
}

function EmptyContent(props: { readonly locale: Locale }): JSX.Element {
  return (
    <p className="result-placeholder">
      {getWebMessage(props.locale, 'finalPlaceholder')}
    </p>
  );
}

export function FinalMarkdownPanel(props: FinalMarkdownPanelProps): JSX.Element {
  const hasResult = props.finalText !== null && props.tokenUsage !== null;

  return (
    <section className={getCardClassName(hasResult)}>
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Final output</p>
          <h2>{getWebMessage(props.locale, 'finalResultTitle')}</h2>
        </div>
        <span className="status-pill">{getStatusLabel(hasResult, props.locale)}</span>
      </div>
      {hasResult
        ? <ResultContent finalText={props.finalText} locale={props.locale} tokenUsage={props.tokenUsage} />
        : <EmptyContent locale={props.locale} />}
    </section>
  );
}
