import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { Locale } from '../../i18n/locale';
import { getWebMessage } from '../i18n/messages';
import { isToolCrashProgressEntry } from '../tool-crash';
import type { ProgressEntry } from '../types';

type LlmProgressPanelProps = {
  readonly entries: readonly ProgressEntry[];
  readonly locale: Locale;
  readonly status: 'idle' | 'running' | 'paused';
};

type ProgressPhase = Extract<ProgressEntry, { type: 'progress' }>['phase'];

function getPhaseLabel(phase: ProgressPhase, locale: Locale): string {
  if (phase === 'process') return getWebMessage(locale, 'progressPhaseProcess');
  if (phase === 'tool-call') return getWebMessage(locale, 'progressPhaseToolCall');
  return getWebMessage(locale, 'progressPhaseSubAgent');
}

function formatActivityValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function renderToolExchange(
  entry: Extract<ProgressEntry, { type: 'progress' }>,
  locale: Locale
): JSX.Element | null {
  if (entry.operationId === undefined) return null;
  return (
    <div className="progress-exchange">
      <small className="progress-operation-id">{getWebMessage(locale, 'progressOperationId')}：{entry.operationId}</small>
      <strong>{getWebMessage(locale, 'progressInput')}</strong>
      <pre>{formatActivityValue(entry.input)}</pre>
      {entry.output === undefined
        ? null
        : (
            <>
              <strong>{getWebMessage(locale, 'progressOutput')}</strong>
              <pre>{formatActivityValue(entry.output)}</pre>
            </>
          )}
    </div>
  );
}

function renderDetails(details: string | undefined): JSX.Element | null {
  if (!details) return null;
  return <p>{details}</p>;
}

function renderProgressContent(
  entry: Extract<ProgressEntry, { type: 'progress' }>,
  locale: Locale
): JSX.Element {
  const toolExchange = renderToolExchange(entry, locale);
  if (!entry.details && !toolExchange) return <span>{entry.message}</span>;
  return (
    <details className="progress-details">
      <summary>{entry.message}</summary>
      {renderDetails(entry.details)}
      {toolExchange}
    </details>
  );
}

function renderProgressEntry(entry: ProgressEntry, locale: Locale): JSX.Element {
  if (entry.type === 'usage') {
    return (
      <li className="progress-item progress-item-usage" key={entry.id}>
        <span className="progress-phase progress-phase-token">{getWebMessage(locale, 'progressToken')}</span>
        <span>
          {entry.source}：{getWebMessage(locale, 'progressSegmentTokenPrefix')} {getWebMessage(locale, 'timelineTokenInput')} {entry.usage.inputTokens.toLocaleString()} {getWebMessage(locale, 'timelineTokenUnit')}
          <small className="token-usage-details">
            {getWebMessage(locale, 'timelineTokenOutput')} {entry.usage.outputTokens.toLocaleString()} · {getWebMessage(locale, 'timelineTokenTotal')} {entry.usage.totalTokens.toLocaleString()}
            {' · '}{getWebMessage(locale, 'progressEstimated')} ${entry.estimatedCostUsd.toFixed(6)}
          </small>
        </span>
      </li>
    );
  }
  const isCrash = isToolCrashProgressEntry(entry);
  const className = isCrash ? 'progress-item progress-item-crash' : 'progress-item';
  return (
    <li className={className} key={entry.id}>
      <span className={`progress-phase progress-phase-${entry.phase}`}>
        {getPhaseLabel(entry.phase, locale)}
      </span>
      {renderProgressContent(entry, locale)}
    </li>
  );
}

export function LlmProgressPanel(props: LlmProgressPanelProps): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const progressItems = props.entries.map(entry => renderProgressEntry(entry, props.locale));

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [props.entries]);

  return (
    <details className="workflow-details" open={props.status !== 'idle'}>
      <summary>{getProgressStatusLabel(props.status, props.locale)}</summary>
      <div className="progress-scroller" ref={scrollerRef}>
        {progressItems.length > 0 ? <ol className="progress-list">{progressItems}</ol> : null}
      </div>
    </details>
  );
}

function getProgressStatusLabel(status: LlmProgressPanelProps['status'], locale: Locale): string {
  if (status === 'running') return getWebMessage(locale, 'progressStatusRunning');
  if (status === 'paused') return getWebMessage(locale, 'progressStatusPaused');
  return getWebMessage(locale, 'progressStatusIdle');
}
