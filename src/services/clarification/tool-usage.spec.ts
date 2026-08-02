import { describe, expect, test } from 'bun:test';
import { collectToolDisplayNames } from './tool-usage';

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
});
