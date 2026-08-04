import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { isToolCrashProgressEntry } from '../tool-crash';
import type { ProgressEntry } from '../types';

type LlmProgressPanelProps = {
  readonly entries: readonly ProgressEntry[];
  readonly status: 'idle' | 'running' | 'paused';
};

type ProgressPhase = Extract<ProgressEntry, { type: 'progress' }>['phase'];

const PHASE_LABELS: Record<ProgressPhase, string> = {
  process: '分析',
  'tool-call': '工具',
  'sub-agent': 'Sub-agent',
};

function formatActivityValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function renderToolExchange(entry: Extract<ProgressEntry, { type: 'progress' }>): JSX.Element | null {
  if (entry.operationId === undefined) return null;
  return (
    <div className="progress-exchange">
      <small className="progress-operation-id">调用 ID：{entry.operationId}</small>
      <strong>Input</strong>
      <pre>{formatActivityValue(entry.input)}</pre>
      {entry.output === undefined
        ? null
        : (
            <>
              <strong>Output</strong>
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

function renderProgressContent(entry: Extract<ProgressEntry, { type: 'progress' }>): JSX.Element {
  const toolExchange = renderToolExchange(entry);
  if (!entry.details && !toolExchange) return <span>{entry.message}</span>;
  return (
    <details className="progress-details">
      <summary>{entry.message}</summary>
      {renderDetails(entry.details)}
      {toolExchange}
    </details>
  );
}

function renderProgressEntry(entry: ProgressEntry): JSX.Element {
  if (entry.type === 'usage') {
    return (
      <li className="progress-item progress-item-usage" key={entry.id}>
        <span className="progress-phase progress-phase-token">Token</span>
        <span>
          {entry.source}：本段 input {entry.usage.inputTokens.toLocaleString()} tokens
          <small className="token-usage-details">
            output {entry.usage.outputTokens.toLocaleString()} · total {entry.usage.totalTokens.toLocaleString()}
            {' · '}预估 ${entry.estimatedCostUsd.toFixed(6)}
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
        {PHASE_LABELS[entry.phase]}
      </span>
      {renderProgressContent(entry)}
    </li>
  );
}

export function LlmProgressPanel(props: LlmProgressPanelProps): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const progressItems = props.entries.map(renderProgressEntry);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [props.entries]);

  return (
    <details className="workflow-details" open={props.status !== 'idle'}>
      <summary>{getProgressStatusLabel(props.status)}</summary>
      <div className="progress-scroller" ref={scrollerRef}>
        {progressItems.length > 0 ? <ol className="progress-list">{progressItems}</ol> : null}
      </div>
    </details>
  );
}

function getProgressStatusLabel(status: LlmProgressPanelProps['status']): string {
  if (status === 'running') return '实时执行中';
  if (status === 'paused') return '网络中断 · 已暂停';
  return '等待任务';
}
