import { describe, expect, test } from 'bun:test';
import { collectToolDisplayNames, collectToolFailures } from './tool-usage';

describe('tool usage display names', () => {
  test('labels built-in and MCP tools and removes duplicates', () => {
    const names = collectToolDisplayNames([
      {
        toolCalls: [
          { toolCallId: '1', toolName: 'browser_search', args: {} },
          { toolCallId: '2', toolName: 'github_get_file_contents', args: {} },
        ],
      },
      {
        toolCalls: [
          { toolCallId: '3', toolName: 'github_get_file_contents', args: {} },
          { toolCallId: '4', toolName: 'custom_tool', args: {} },
        ],
      },
    ], new Set(['github_get_file_contents']));

    expect(names).toEqual([
      'browser_search（内置）',
      'github_get_file_contents（MCP）',
      'custom_tool',
    ]);
  });

  test('collects failed tool results once per tool', () => {
    const failures = collectToolFailures([
      {
        toolResults: [
          {
            toolCallId: '1',
            toolName: 'github_get_latest_release',
            result: { ok: false, error: '404 Not Found' },
          },
        ],
      },
      {
        toolResults: [
          {
            toolCallId: '2',
            toolName: 'github_get_latest_release',
            result: { ok: false, error: 'still unavailable' },
          },
          {
            toolCallId: '3',
            toolName: 'github_get_repo',
            result: { ok: true },
          },
        ],
      },
    ]);

    expect(failures).toEqual([
      {
        toolName: 'github_get_latest_release',
        error: 'still unavailable',
      },
    ]);
  });
});
