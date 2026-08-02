import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { ProgressEntry } from '../types';

type LlmProgressPanelProps = {
  readonly entries: readonly ProgressEntry[];
  readonly isActive: boolean;
};

const PHASE_LABELS: Record<ProgressEntry['phase'], string> = {
  process: '分析',
  'tool-call': '工具',
  'sub-agent': 'Sub-agent',
};

function renderProgressEntry(entry: ProgressEntry): JSX.Element {
  const content = entry.details
    ? (
        <details className="progress-details">
          <summary>{entry.message}</summary>
          <p>{entry.details}</p>
        </details>
      )
    : <span>{entry.message}</span>;
  return (
    <li className="progress-item" key={entry.id}>
      <span className={`progress-phase progress-phase-${entry.phase}`}>
        {PHASE_LABELS[entry.phase]}
      </span>
      {content}
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
    <section className="panel-surface progress-card" aria-live="polite">
      <div className="panel-heading progress-heading">
        <div>
          <p className="section-kicker">LLM workflow</p>
          <h2>AI 思考过程</h2>
        </div>
        <span className="status-pill">{props.isActive ? '实时执行中' : '等待任务'}</span>
      </div>
      <div className="progress-scroller" ref={scrollerRef}>
        {progressItems.length > 0
          ? <ol className="progress-list">{progressItems}</ol>
          : <p className="progress-placeholder">提交想法后，这里会实时展示分析、工具调用和 Sub-agent 进度。</p>}
      </div>
    </section>
  );
}
