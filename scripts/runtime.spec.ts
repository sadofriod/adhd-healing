import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
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
