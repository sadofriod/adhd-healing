import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, realpath, rm } from 'fs/promises';
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
    const cwdMarkerPath = join(vaultPath, 'nested', 'cwd.txt');

    await writeObsidianNote('nested/cli-note.md', '# hello\n', {
      backend: 'cli',
      vaultPath,
      cliCommand: 'python3',
      cliArgs: [
        '-c',
        'import pathlib, sys; p = pathlib.Path(sys.argv[1]); cwd_marker = pathlib.Path(sys.argv[2]); p.write_text(p.read_text(encoding="utf-8") + "\\nCLI_OK", encoding="utf-8"); cwd_marker.write_text(pathlib.Path.cwd().as_posix(), encoding="utf-8")',
        '{path}',
        '{vault}/nested/cwd.txt',
      ],
      executeTool: async () => {
        throw new Error('MCP should not be used for CLI mode');
      },
    });

    const content = await readFile(join(vaultPath, 'nested/cli-note.md'), 'utf8');
    const cwd = await readFile(cwdMarkerPath, 'utf8');
    const expectedCwd = await realpath(join(vaultPath, 'nested'));
    expect(content).toContain('# hello');
    expect(content).toContain('CLI_OK');
    expect(cwd.trim()).toBe(expectedCwd);
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
