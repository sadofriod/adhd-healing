import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolCrashPanel } from './ToolCrashPanel';

describe('ToolCrashPanel', () => {
  test('renders categorized crash messages', () => {
    const markup = renderToStaticMarkup(
      <ToolCrashPanel
        crashes={[
          {
            id: 'mcp-1',
            category: 'mcp',
            toolName: 'github_get_repo（MCP）',
            error: 'MCP tool failed: github_get_repo',
            operationId: 'call-1',
            source: 'tool-output',
          },
          {
            id: 'tool-1',
            category: 'other-tool',
            toolName: 'my_custom_tool',
            error: 'timeout while executing tool',
            source: 'stream-error',
          },
        ]}
      />
    );

    expect(markup).toContain('Crash 级别错误');
    expect(markup).toContain('MCP CRASH');
    expect(markup).toContain('TOOL CRASH');
    expect(markup).toContain('github_get_repo（MCP）');
    expect(markup).toContain('my_custom_tool');
  });
});