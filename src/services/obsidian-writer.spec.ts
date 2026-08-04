import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeObsidianNote } from './obsidian-writer';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

describe('Obsidian writer adapter', () => {
  it('writes to the vault and invokes the configured CLI command', async () => {
    const vaultPath = await mkdtemp(join(tmpdir(), 'obsidian-cli-test-'));
    tempDirs.push(vaultPath);

    await writeObsidianNote('nested/cli-note.md', '# hello\n', {
      backend: 'cli',
      vaultPath,
      cliCommand: 'python3',
      cliArgs: [
        '-c',
        'import pathlib, sys; p = pathlib.Path(sys.argv[1]); p.write_text(p.read_text(encoding="utf-8") + "\\nCLI_OK", encoding="utf-8")',
        '{path}',
      ],
      executeTool: async () => {
        throw new Error('MCP should not be used for CLI mode');
      },
    });

    const content = await readFile(join(vaultPath, 'nested/cli-note.md'), 'utf8');
    expect(content).toContain('# hello');
    expect(content).toContain('CLI_OK');
  });

  it('fails fast with install guidance when CLI is unavailable in auto mode', async () => {
    const calls: Array<{ path: string; content: string }> = [];
    const vaultPath = await mkdtemp(join(tmpdir(), 'obsidian-mcp-fallback-'));
    tempDirs.push(vaultPath);

    await expect(writeObsidianNote('note.md', 'hello', {
      backend: 'auto',
      vaultPath,
      cliCommand: 'missing-command',
      executeTool: async (_toolName, args) => {
        calls.push({ path: args.path as string, content: args.content as string });
        return { ok: true };
      },
    })).rejects.toThrow('Install Obsidian CLI from https://obsidian.md/cli');

    expect(calls).toEqual([]);
  });
});
