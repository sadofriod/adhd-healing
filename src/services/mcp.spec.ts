import { describe, expect, test } from 'bun:test';
import { tool } from 'ai';
import { z } from 'zod';
import { makeMcpToolsResilient, parseMcpConfig, resolveMcpEnvironment } from './mcp';

describe('MCP configuration', () => {
  test('parses a stdio server', () => {
    const config = parseMcpConfig({
      servers: {
        github: { type: 'stdio', command: 'docker' },
      },
    });

    expect(config.servers.github?.args).toEqual([]);
    expect(config.servers.github?.env).toEqual({});
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
        execute: async () => {
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