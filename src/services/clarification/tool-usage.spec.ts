import { describe, expect, test } from 'bun:test';
import { collectToolDisplayNames, collectToolFailures } from './tool-usage';

describe('tool usage display names', () => {
  test('labels built-in and MCP tools and removes duplicates', () => {
    const names = collectToolDisplayNames([
      {
        toolCalls: [
          { toolName: 'browser_search' },
          { toolName: 'github_get_file_contents' },
        ],
      },
      {
        toolCalls: [
          { toolName: 'github_get_file_contents' },
          { toolName: 'custom_tool' },
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
            toolName: 'github_get_latest_release',
            result: { ok: false, error: '404 Not Found' },
          },
        ],
      },
      {
        toolResults: [
          {
            toolName: 'github_get_latest_release',
            result: { ok: false, error: 'still unavailable' },
          },
          {
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
