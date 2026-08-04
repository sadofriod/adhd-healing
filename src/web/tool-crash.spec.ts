import { describe, expect, test } from 'bun:test';
import type { ProgressEntry } from './types';
import { collectToolCrashes, isToolCrashProgressEntry } from './tool-crash';

function makeProgressEntry(partial: Partial<Extract<ProgressEntry, { type: 'progress' }>>): ProgressEntry {
  return {
    id: 'entry-1',
    type: 'progress',
    phase: 'tool-call',
    message: 'github_get_file_contents（MCP）',
    ...partial,
  };
}

describe('tool crash detection', () => {
  test('detects MCP tool failures from tool output payloads', () => {
    const entries: readonly ProgressEntry[] = [
      makeProgressEntry({
        operationId: 'call-1',
        output: { ok: false, error: '404 Not Found' },
      }),
    ];

    const crashes = collectToolCrashes(entries, null);

    expect(crashes).toEqual([{
      id: 'tool-output:call-1:github_get_file_contents（MCP）:404 Not Found',
      category: 'mcp',
      toolName: 'github_get_file_contents（MCP）',
      error: '404 Not Found',
      operationId: 'call-1',
      source: 'tool-output',
    }]);
  });

  test('detects stream errors and marks MCP category when message mentions MCP', () => {
    const crashes = collectToolCrashes([], 'MCP tool failed: github_get_repo');

    expect(crashes).toEqual([{
      id: 'stream-error:MCP tool failed: github_get_repo',
      category: 'mcp',
      toolName: 'github_get_repo（MCP）',
      error: 'MCP tool failed: github_get_repo',
      source: 'stream-error',
    }]);
  });

  test('only marks tool-call failure entries as crash entries', () => {
    expect(isToolCrashProgressEntry(makeProgressEntry({ output: { ok: false } }))).toBeTrue();
    expect(isToolCrashProgressEntry(makeProgressEntry({ output: { ok: true } }))).toBeFalse();
    expect(isToolCrashProgressEntry(makeProgressEntry({ phase: 'process', output: { ok: false } }))).toBeFalse();
  });
});