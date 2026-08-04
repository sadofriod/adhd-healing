import { describe, expect, test } from 'bun:test';
import { tool } from 'ai';
import { z } from 'zod';
import { buildFilesystemServerConfig, filterFilesystemReadTools } from './filesystem-mcp';

describe('filesystem MCP integration', () => {
  test('builds a stdio server config for allowed directories', () => {
    expect(buildFilesystemServerConfig(['/tmp/vault', '/tmp/docs'])).toEqual({
      type: 'stdio',
      command: 'pnpm',
      args: ['exec', 'mcp-server-filesystem', '/tmp/vault', '/tmp/docs'],
      env: {},
      exposeToModel: true,
    });
  });

  test('filters filesystem tools down to read-only operations', () => {
    const tools = filterFilesystemReadTools({
      read_text_file: tool({
        parameters: z.object({ path: z.string() }),
        execute: async () => ({ content: 'hello' }),
      }),
      write_file: tool({
        parameters: z.object({ path: z.string(), content: z.string() }),
        execute: async () => ({ ok: true }),
      }),
    });

    expect(Object.keys(tools)).toEqual(['read_text_file']);
  });
});