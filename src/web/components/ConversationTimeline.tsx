import type { JSX } from 'react';
import type { TimelineEntry } from '../types';

type ConversationTimelineProps = {
  readonly entries: readonly TimelineEntry[];
};

function getRoleLabel(role: TimelineEntry['role']): string {
  if (role === 'assistant') return 'Assistant';
  return 'You';
}

export function ConversationTimeline(props: ConversationTimelineProps): JSX.Element {
  const timelineItems = props.entries.map(entry => {
    const itemClassName = `timeline-item timeline-item-${entry.role}`;
    return (
      <li className={itemClassName} key={entry.id}>
        <div className="timeline-meta-row">
          <span>{getRoleLabel(entry.role)}</span>
          <span>turn {entry.turnIndex}</span>
        </div>
        <p>{entry.content}</p>
        {entry.tokenUsage && entry.estimatedCostUsd !== undefined
          ? (
              <small className="timeline-usage">
                input {entry.tokenUsage.inputTokens.toLocaleString()} · output{' '}
                {entry.tokenUsage.outputTokens.toLocaleString()} · total{' '}
                {entry.tokenUsage.totalTokens.toLocaleString()} tokens · 预估 ${entry.estimatedCostUsd.toFixed(6)}
              </small>
            )
          : null}
      </li>
    );
  });

  return (
    <ol className="timeline-list">{timelineItems}</ol>
  );
}
