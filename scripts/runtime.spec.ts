import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { assertNoRootObsidianWorkspace } from './runtime';

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

  test('fails startup when repository root contains .obsidian directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'runtime-guard-'));
    tempDirs.push(cwd);
    await mkdir(join(cwd, '.obsidian'), { recursive: true });

    await expect(assertNoRootObsidianWorkspace(cwd)).rejects.toThrow(
      'Unexpected root .obsidian directory detected'
    );
  });
});
