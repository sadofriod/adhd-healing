import type { JSX } from 'react';
import type { ToolCrash, ToolCrashCategory } from '../tool-crash';

type ToolCrashPanelProps = {
  readonly crashes: readonly ToolCrash[];
};

const CATEGORY_LABELS: Readonly<Record<ToolCrashCategory, string>> = {
  mcp: 'MCP CRASH',
  'built-in': 'BUILT-IN TOOL CRASH',
  'other-tool': 'TOOL CRASH',
  unknown: 'UNKNOWN CRASH',
};

function getCategoryClassName(category: ToolCrashCategory): string {
  return `crash-category crash-category-${category}`;
}

export function ToolCrashPanel(props: ToolCrashPanelProps): JSX.Element | null {
  if (props.crashes.length === 0) return null;

  return (
    <section className="tool-crash-panel" aria-live="assertive" aria-atomic="false">
      <h2>Crash 级别错误</h2>
      <ol className="tool-crash-list">
        {props.crashes.map(crash => (
          <li className="tool-crash-item" key={crash.id}>
            <span className={getCategoryClassName(crash.category)}>{CATEGORY_LABELS[crash.category]}</span>
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