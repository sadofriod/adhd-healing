import type { JSX } from 'react';
import type { TimelineEntry } from '../types.js';

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
      </li>
    );
  });

  return (
    <section className="panel-surface timeline-card">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Timeline</p>
          <h2>对话轨迹</h2>
        </div>
        <span className="session-chip">
          {props.entries.length > 1 ? 'session active' : 'awaiting first turn'}
        </span>
      </div>
      <ol className="timeline-list">{timelineItems}</ol>
    </section>
  );
}
