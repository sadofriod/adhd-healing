import type { ProgressEntry } from './types';

export type ToolCrashCategory = 'mcp' | 'built-in' | 'other-tool' | 'unknown';

export type ToolCrash = {
  readonly id: string;
  readonly category: ToolCrashCategory;
  readonly toolName: string;
  readonly error: string;
  readonly operationId?: string;
  readonly source: 'tool-output' | 'stream-error';
};

type ToolResultLike = {
  readonly ok?: unknown;
  readonly isError?: unknown;
  readonly error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isToolFailureResult(value: unknown): value is ToolResultLike {
  if (!isRecord(value)) return false;
  return value.ok === false || value.isError === true;
}

function parseFailureError(value: ToolResultLike): string {
  if (typeof value.error === 'string' && value.error.trim()) return value.error;
  return '工具返回失败状态';
}

function normalizeToolName(message: string): string {
  return message.trim() || 'unknown-tool';
}

function classifyToolName(toolName: string): ToolCrashCategory {
  if (toolName.includes('（MCP）')) return 'mcp';
  if (toolName.includes('（内置）')) return 'built-in';
  if (toolName === 'unknown-tool') return 'unknown';
  return 'other-tool';
}

function createToolOutputCrash(entry: Extract<ProgressEntry, { type: 'progress' }>, index: number): ToolCrash | null {
  if (entry.phase !== 'tool-call') return null;
  if (!isToolFailureResult(entry.output)) return null;
  const toolName = normalizeToolName(entry.message);
  const error = parseFailureError(entry.output);
  return {
    id: `tool-output:${entry.operationId ?? index}:${toolName}:${error}`,
    category: classifyToolName(toolName),
    toolName,
    error,
    operationId: entry.operationId,
    source: 'tool-output',
  };
}

function parseToolNameFromStreamError(errorMessage: string): string {
  const match = errorMessage.match(/MCP tool (?:failed|is unavailable):\s*([^\s]+)/u);
  if (match?.[1]) return `${match[1]}（MCP）`;
  return 'unknown-tool';
}

function classifyStreamError(errorMessage: string): ToolCrashCategory {
  if (/\bMCP\b/u.test(errorMessage)) return 'mcp';
  if (/\btool\b/u.test(errorMessage)) return 'other-tool';
  return 'unknown';
}

export function isToolCrashProgressEntry(entry: ProgressEntry): boolean {
  if (entry.type !== 'progress') return false;
  if (entry.phase !== 'tool-call') return false;
  return isToolFailureResult(entry.output);
}

export function collectToolCrashes(
  entries: readonly ProgressEntry[],
  streamErrorMessage: string | null
): readonly ToolCrash[] {
  const crashes = entries.flatMap((entry, index) => {
    if (entry.type !== 'progress') return [];
    const crash = createToolOutputCrash(entry, index);
    return crash ? [crash] : [];
  });

  if (streamErrorMessage && streamErrorMessage.trim()) {
    crashes.push({
      id: `stream-error:${streamErrorMessage}`,
      category: classifyStreamError(streamErrorMessage),
      toolName: parseToolNameFromStreamError(streamErrorMessage),
      error: streamErrorMessage,
      source: 'stream-error',
    });
  }

  return [...new Map(crashes.map(crash => [crash.id, crash])).values()];
}