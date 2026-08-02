import { describe, expect, test } from 'bun:test';
import { tool } from 'ai';
import { z } from 'zod';
import { makeMcpToolsResilient } from './mcp';
import {
  parseMcpConfig,
  resolveMcpEnvironment,
  type McpConfig,
} from './mcpConfig';

function getStdioServer(config: McpConfig, name: string): Extract<
  McpConfig['servers'][string],
  { type: 'stdio' }
> {
  const server = config.servers[name];
  if (server?.type !== 'stdio') throw new Error(`Expected stdio server: ${name}`);
  return server;
}

describe('MCP configuration', () => {
  test('parses a stdio server', () => {
    const config = parseMcpConfig({
      servers: {
        github: { type: 'stdio', command: 'docker' },
      },
    });

    const github = getStdioServer(config, 'github');
    expect(github.args).toEqual([]);
    expect(github.env).toEqual({});
  });

  test('parses an SSE server for a standalone Obsidian gateway', () => {
    const config = parseMcpConfig({
      servers: {
        obsidian: {
          type: 'sse',
          url: 'http://localhost:3001/sse',
          headers: { Authorization: '${env:OBSIDIAN_MCP_AUTHORIZATION}' },
        },
      },
    });

    expect(config.servers.obsidian?.type).toBe('sse');
  });

  test('resolves environment references without storing secrets', () => {
    expect(resolveMcpEnvironment(
      { TOKEN: '${env:GITHUB_PERSONAL_ACCESS_TOKEN}', MODE: 'read-only' },
      { GITHUB_PERSONAL_ACCESS_TOKEN: 'secret' }
    )).toEqual({ TOKEN: 'secret', MODE: 'read-only' });
  });

  test('rejects a missing referenced environment variable', () => {
    expect(() => resolveMcpEnvironment(
      { TOKEN: '${env:GITHUB_PERSONAL_ACCESS_TOKEN}' },
      {}
    )).toThrow('Missing environment variable GITHUB_PERSONAL_ACCESS_TOKEN');
  });

  test('returns MCP execution failures to the model as tool results', async () => {
    const resilientTools = makeMcpToolsResilient('github', {
      get_latest_release: tool({
        parameters: z.object({ repo: z.string() }),
        execute: async (): Promise<{ readonly ok: boolean }> => {
          throw new Error('404 Not Found');
        },
      }),
    });

    const result = await resilientTools.github_get_latest_release?.execute?.(
      { repo: 'agent-company' },
      { toolCallId: 'release-call', messages: [] }
    );

    expect(result).toEqual({ ok: false, error: '404 Not Found' });
  });
});