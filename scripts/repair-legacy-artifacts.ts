import type { Dirent } from 'fs';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { repairLegacyArtifactDirectory, type ArtifactRepairFile } from '../src/services/obsidian-artifact-repair';

const VAULT_ROOT = join(process.cwd(), '.local-vault');
const BRAINSTORM_ROOT = join(VAULT_ROOT, 'Brainstorm');
const CHECKPOINT_DIRNAME = '_session-checkpoints';

function isLegacyArtifactDirectoryName(directoryName: string): boolean {
  return directoryName.startsWith('session-') || /^\d{4}-\d{2}-\d{2}-\d{9}-.+$/u.test(directoryName);
}

async function listDirectories(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => join(root, String(entry.name)));
}

async function listMarkdownFiles(root: string): Promise<ArtifactRepairFile[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => collectMarkdownFiles(root, entry)));
  return files.flat().sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

async function collectMarkdownFiles(root: string, entry: Dirent): Promise<ArtifactRepairFile[]> {
  if (!entry.isFile()) return [];
  const name = String(entry.name);
  if (!name.endsWith('.md')) return [];
  return [{
    name,
    content: await readFile(join(root, name), 'utf8'),
  }];
}

async function writeRepairedDirectory(
  sourceDirectoryPath: string,
  targetDirectoryPath: string,
  files: readonly ArtifactRepairFile[]
): Promise<void> {
  await mkdir(targetDirectoryPath, { recursive: true });
  for (const file of files) {
    await writeFile(join(targetDirectoryPath, file.name), file.content, 'utf8');
  }
  if (sourceDirectoryPath !== targetDirectoryPath) {
    await rm(sourceDirectoryPath, { recursive: true, force: true });
  }
}

async function repairLegacySessionDirectory(directoryPath: string): Promise<void> {
  const directoryName = directoryPath.split('/').at(-1);
  if (!directoryName) return;
  const files = await listMarkdownFiles(directoryPath);
  if (files.length === 0) return;

  const repaired = repairLegacyArtifactDirectory(directoryName, files);
  const targetDirectoryPath = join(BRAINSTORM_ROOT, repaired.directoryName);
  await writeRepairedDirectory(directoryPath, targetDirectoryPath, repaired.files);
  console.log(`[repair] Repaired artifact directory: ${directoryName} -> ${repaired.directoryName}`);
}

async function mergeDirectoryContents(sourcePath: string, targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
  const entries = await readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const name = String(entry.name);
    const sourceEntryPath = join(sourcePath, name);
    const targetEntryPath = join(targetPath, name);
    if (entry.isDirectory()) {
      await mergeDirectoryContents(sourceEntryPath, targetEntryPath);
      await rm(sourceEntryPath, { recursive: true, force: true });
      continue;
    }
    await cp(sourceEntryPath, targetEntryPath, { force: true });
    await rm(sourceEntryPath, { force: true });
  }
}

async function relocateCheckpointDirectory(directoryPath: string): Promise<void> {
  const targetPath = join(VAULT_ROOT, CHECKPOINT_DIRNAME);
  if (directoryPath === targetPath) return;
  await mergeDirectoryContents(directoryPath, targetPath);
  await rm(directoryPath, { recursive: true, force: true });
  console.log(`[repair] Moved checkpoints: ${directoryPath} -> ${targetPath}`);
}

async function repairBrainstormArtifacts(): Promise<void> {
  await mkdir(BRAINSTORM_ROOT, { recursive: true });
  const directories = await listDirectories(BRAINSTORM_ROOT);

  for (const directoryPath of directories) {
    const directoryName = directoryPath.split('/').at(-1) ?? '';
    if (directoryName === CHECKPOINT_DIRNAME) {
      await relocateCheckpointDirectory(directoryPath);
      continue;
    }
    if (!isLegacyArtifactDirectoryName(directoryName)) continue;
    await repairLegacySessionDirectory(directoryPath);
  }
}

await repairBrainstormArtifacts();