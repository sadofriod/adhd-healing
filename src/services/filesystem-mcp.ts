import { type ToolSet } from 'ai';
import type { McpConfig } from './mcpConfig';

export const FILESYSTEM_MCP_READ_TOOL_NAMES = [
  'read_text_file',
  'read_media_file',
  'read_multiple_files',
  'list_directory',
  'list_directory_with_sizes',
  'directory_tree',
  'search_files',
  'get_file_info',
  'list_allowed_directories',
] as const;

function isFilesystemReadTool(toolName: string): boolean {
  return FILESYSTEM_MCP_READ_TOOL_NAMES.includes(toolName as (typeof FILESYSTEM_MCP_READ_TOOL_NAMES)[number]);
}

export function buildFilesystemServerConfig(
  allowedDirectories: readonly string[]
): Extract<McpConfig['servers'][string], { type: 'stdio' }> | null {
  if (allowedDirectories.length === 0) return null;

  return {
    type: 'stdio',
    command: 'pnpm',
    args: ['exec', 'mcp-server-filesystem', ...allowedDirectories],
    env: {},
    exposeToModel: true,
  };
}

export function filterFilesystemReadTools(serverTools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(serverTools).filter(([toolName]) => isFilesystemReadTool(toolName))
  );
}