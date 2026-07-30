import type { JSX } from 'react';

type CurrentPromptCardProps = {
  readonly prompt: string;
  readonly sessionId: string | null;
  readonly isBusy: boolean;
  readonly isComplete: boolean;
};

function getStatusLabel(isBusy: boolean, isComplete: boolean): string {
  if (isBusy) return '处理中';
  if (isComplete) return '已完成';
  return '进行中';
}

export function CurrentPromptCard(props: CurrentPromptCardProps): JSX.Element {
  const statusLabel = getStatusLabel(props.isBusy, props.isComplete);

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
      <p className="session-meta">{props.sessionId ? `session_id: ${props.sessionId}` : '首轮输入会自动创建新会话。'}</p>
    </section>
  );
}