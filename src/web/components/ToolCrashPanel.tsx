import type { JSX } from 'react';
import type { Locale } from '../../i18n/locale';
import { getWebMessage } from '../i18n/messages';
import type { ToolCrash, ToolCrashCategory } from '../tool-crash';

type ToolCrashPanelProps = {
  readonly crashes: readonly ToolCrash[];
  readonly locale: Locale;
};

const CATEGORY_MESSAGE_KEYS: Readonly<Record<ToolCrashCategory, 'crashCategoryMcp' | 'crashCategoryBuiltIn' | 'crashCategoryOtherTool' | 'crashCategoryUnknown'>> = {
  mcp: 'crashCategoryMcp',
  'built-in': 'crashCategoryBuiltIn',
  'other-tool': 'crashCategoryOtherTool',
  unknown: 'crashCategoryUnknown',
};

function getCategoryLabel(category: ToolCrashCategory, locale: Locale): string {
  return getWebMessage(locale, CATEGORY_MESSAGE_KEYS[category]);
}

function getCategoryClassName(category: ToolCrashCategory): string {
  return `crash-category crash-category-${category}`;
}

export function ToolCrashPanel(props: ToolCrashPanelProps): JSX.Element | null {
  if (props.crashes.length === 0) return null;

  return (
    <section className="tool-crash-panel" aria-live="assertive" aria-atomic="false">
      <h2>{getWebMessage(props.locale, 'crashPanelTitle')}</h2>
      <ol className="tool-crash-list">
        {props.crashes.map(crash => (
          <li className="tool-crash-item" key={crash.id}>
            <span className={getCategoryClassName(crash.category)}>{getCategoryLabel(crash.category, props.locale)}</span>
            <p className="tool-crash-message">{crash.error}</p>
            <p className="tool-crash-meta">
              tool: {crash.toolName}
              {crash.operationId ? ` · call: ${crash.operationId}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}