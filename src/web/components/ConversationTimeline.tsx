import type { JSX } from 'react';
import type { Locale } from '../../i18n/locale';
import { getWebMessage } from '../i18n/messages';
import type { TimelineEntry } from '../types';

type ConversationTimelineProps = {
  readonly entries: readonly TimelineEntry[];
  readonly locale: Locale;
};

function getRoleLabel(role: TimelineEntry['role'], locale: Locale): string {
  if (role === 'assistant') return getWebMessage(locale, 'timelineAssistant');
  return getWebMessage(locale, 'timelineUser');
}

export function ConversationTimeline(props: ConversationTimelineProps): JSX.Element {
  const timelineItems = props.entries.map(entry => {
    const itemClassName = `timeline-item timeline-item-${entry.role}`;
    return (
      <li className={itemClassName} key={entry.id}>
        <div className="timeline-meta-row">
          <span>{getRoleLabel(entry.role, props.locale)}</span>
          <span>{getWebMessage(props.locale, 'timelineTurn')} {entry.turnIndex}</span>
        </div>
        <p>{entry.content}</p>
        {entry.tokenUsage && entry.estimatedCostUsd !== undefined
          ? (
              <small className="timeline-usage">
                {getWebMessage(props.locale, 'timelineTokenInput')} {entry.tokenUsage.inputTokens.toLocaleString()} · {getWebMessage(props.locale, 'timelineTokenOutput')}{' '}
                {entry.tokenUsage.outputTokens.toLocaleString()} · {getWebMessage(props.locale, 'timelineTokenTotal')}{' '}
                {entry.tokenUsage.totalTokens.toLocaleString()} {getWebMessage(props.locale, 'timelineTokenUnit')} · {getWebMessage(props.locale, 'timelineEstimated')} ${entry.estimatedCostUsd.toFixed(6)}
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
