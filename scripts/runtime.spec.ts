import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseMcpConfig } from '../src/services/mcpConfig';
import { assertNoRootObsidianWorkspace, prefetchNpxMcpDependencies } from './runtime';

const tempDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('runtime guard for root .obsidian', () => {
  test('allows startup when repository root does not contain .obsidian', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'runtime-guard-'));
    tempDirs.push(cwd);

    await expect(assertNoRootObsidianWorkspace(cwd)).resolves.toBeUndefined();
  });

  test('auto-cleans root .obsidian when it only contains tool-generated metadata files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'runtime-guard-'));
    tempDirs.push(cwd);
    const obsidianRoot = join(cwd, '.obsidian');
    await mkdir(obsidianRoot, { recursive: true });
    await Promise.all([
      writeFile(join(obsidianRoot, 'app.json'), '{}', 'utf8'),
      writeFile(join(obsidianRoot, 'appearance.json'), '{}', 'utf8'),
      writeFile(join(obsidianRoot, 'core-plugins.json'), '[]', 'utf8'),
      writeFile(join(obsidianRoot, 'workspace.json'), '{}', 'utf8'),
    ]);

    await expect(assertNoRootObsidianWorkspace(cwd)).resolves.toBeUndefined();
    await expect(assertNoRootObsidianWorkspace(cwd)).resolves.toBeUndefined();
  });

  test('fails startup when root .obsidian contains non-standard files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'runtime-guard-'));
    tempDirs.push(cwd);
    const obsidianRoot = join(cwd, '.obsidian');
    await mkdir(obsidianRoot, { recursive: true });
    await writeFile(join(obsidianRoot, 'my-notes.md'), '# keep me', 'utf8');

    await expect(assertNoRootObsidianWorkspace(cwd)).rejects.toThrow(
      'Unexpected root .obsidian directory detected'
    );
  });
});

describe('MCP dependency prefetch', () => {
  test('prefetches dependencies for npx MCP servers during startup', async () => {
    const calls: Array<{ command: string[]; environment: Record<string, string | undefined> | undefined }> = [];
    const spawn = (
      command: string[],
      options?: { readonly environment?: Record<string, string | undefined> }
    ) => {
      calls.push({ command, environment: options?.environment });
      return {
        exited: Promise.resolve(0),
      } as ReturnType<typeof Bun.spawn>;
    };

    const mcpConfig = parseMcpConfig({
      servers: {
        cloakbrowser: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'cloakbrowser-mcp@1.10.0'],
          env: {
            NPM_CONFIG_CACHE: '.npm-cache',
          },
        },
        github: {
          type: 'stdio',
          command: 'docker',
          args: ['run'],
        },
      },
    });

    await prefetchNpxMcpDependencies(mcpConfig, spawn);

    expect(calls.length).toBe(1);
    expect(calls[0].command).toEqual([
      'npm',
      'exec',
      '--yes',
      '--package',
      'cloakbrowser-mcp@1.10.0',
      '--',
      'node',
      '-e',
      'process.exit(0)',
    ]);
    expect(calls[0].environment?.NPM_CONFIG_CACHE).toBe('.npm-cache');
  });
});
