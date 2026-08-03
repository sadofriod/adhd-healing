import type { JSX } from 'react';
import type { ExecutionStatus } from '../types';

type CurrentPromptCardProps = {
  readonly prompt: string;
  readonly executionStatus: ExecutionStatus;
  readonly isComplete: boolean;
};

const STATUS_LABELS: Readonly<Record<ExecutionStatus, string>> = {
  idle: '进行中',
  running: '处理中',
  paused: '已暂停',
};

function getStatusLabel(executionStatus: ExecutionStatus, isComplete: boolean): string {
  if (isComplete) return '已完成';
  return STATUS_LABELS[executionStatus];
}

export function CurrentPromptCard(props: CurrentPromptCardProps): JSX.Element {
  const statusLabel = getStatusLabel(props.executionStatus, props.isComplete);

  return (
    <section className="panel-surface prompt-card">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Current prompt</p>
          <h2>当前追问</h2>
        </div>
        <span className="status-pill">{statusLabel}</span>
      </div>
      <p className="prompt-copy">{props.prompt}</p>
    </section>
  );
}
