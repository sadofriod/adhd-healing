import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { config } from '../../config/env';
import { buildArchiveContent, buildFileContent, type ArchiveConversationInput } from './content';
import { buildArchiveRelativePath, buildVaultFilename, getLocalArchiveRoot } from './filename';
import { rebuildArchiveIndex } from './indexing';

export async function saveToLocalVault(
  title: string,
  finalMarkdown: string,
  rawText: string
): Promise<string> {
  await mkdir(config.brainVaultPath, { recursive: true });
  const filename = buildVaultFilename(title);
  const filePath = join(config.brainVaultPath, filename);
  const content = buildFileContent(title, finalMarkdown, rawText);
  await writeFile(filePath, content, 'utf-8');
  console.log(`[vault] Saved: ${filePath}`);
  return filePath;
}

export async function archiveConversation(input: ArchiveConversationInput): Promise<string> {
  const now = input.now ?? new Date();
  const archiveRoot = getLocalArchiveRoot();
  const filename = buildVaultFilename(input.title, now);
  const relativePath = buildArchiveRelativePath(input.classification, filename);
  const absolutePath = join(archiveRoot, relativePath);

  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buildArchiveContent(input, now), 'utf-8');
  await rebuildArchiveIndex();

  console.log(`[vault] Archived conversation: ${absolutePath}`);
  return absolutePath;
}
