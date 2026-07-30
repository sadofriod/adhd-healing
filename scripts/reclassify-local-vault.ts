import type { Dirent } from 'fs';
import { mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { classifyArchiveDocument } from '../src/services/clarification.js';
import { rebuildArchiveIndex } from '../src/services/vault.js';

const ARCHIVE_ROOT = join(process.cwd(), '.local-vault');
const INDEX_FILENAME = 'index.md';

function toPortablePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function sanitizeSegment(value: string, fallback: string): string {
  const segment = value
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .replace(/\s+/g, '-')
    .trim()
    .toLowerCase();

  if (segment.length > 0) return segment;
  return fallback;
}

function extractFrontMatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? null;
}

function extractFrontMatterLine(frontMatter: string, key: string): string | null {
  const match = frontMatter.match(new RegExp(`^${key}:\\s+(.+)$`, 'm'));
  const value = match?.[1];
  if (!value) return null;
  return value.trim();
}

function parseJsonString(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}

function parseDocumentWithoutFrontMatter(filePath: string, content: string): {
  title: string;
  date: string;
  body: string;
  hasCategoryMetadata: boolean;
} {
  const title = filePath.split('/').pop()?.replace(/\.md$/i, '') ?? 'untitled-idea';
  return {
    title,
    date: new Date(0).toISOString(),
    body: content.trim(),
    hasCategoryMetadata: false,
  };
}

function parseDocumentWithFrontMatter(filePath: string, content: string, frontMatter: string): {
  title: string;
  date: string;
  body: string;
  hasCategoryMetadata: boolean;
} {
  const titleFallback = filePath.split('/').pop()?.replace(/\.md$/i, '') ?? 'untitled-idea';
  const title = parseJsonString(extractFrontMatterLine(frontMatter, 'title'), titleFallback);
  const date = parseJsonString(extractFrontMatterLine(frontMatter, 'date'), new Date(0).toISOString());
  const hasCategoryMetadata = Boolean(extractFrontMatterLine(frontMatter, 'category'));
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();

  return { title, date, body, hasCategoryMetadata };
}

function parseArchiveDocument(filePath: string, content: string): {
  title: string;
  date: string;
  body: string;
  hasCategoryMetadata: boolean;
} {
  const frontMatter = extractFrontMatter(content);

  if (!frontMatter) return parseDocumentWithoutFrontMatter(filePath, content);
  return parseDocumentWithFrontMatter(filePath, content, frontMatter);
}

function buildFrontMatter(title: string, date: string, classification: Awaited<ReturnType<typeof classifyArchiveDocument>>): string {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${date}`,
    `category: ${JSON.stringify(classification.category)}`,
    `subcategory: ${JSON.stringify(classification.subcategory)}`,
    `summary: ${JSON.stringify(classification.summary)}`,
    `tags: ${JSON.stringify(classification.tags)}`,
    '---',
  ].join('\n');
}

function buildDestinationPath(title: string, fileName: string, classification: Awaited<ReturnType<typeof classifyArchiveDocument>>): string {
  const category = sanitizeSegment(classification.category, 'uncategorized');
  const subcategory = sanitizeSegment(classification.subcategory, 'general');
  const safeFileName = fileName.endsWith('.md') ? fileName : `${title}.md`;
  return join(ARCHIVE_ROOT, category, subcategory, safeFileName);
}

async function listArchiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => collectEntryFiles(root, entry)));

  return nested.flat();
}

function isMarkdownArchiveFile(name: string): boolean {
  if (!name.endsWith('.md')) return false;
  return name !== INDEX_FILENAME;
}

function isFileEntry(entry: Dirent): boolean {
  return entry.isFile();
}

async function collectFileEntry(entryPath: string, name: string): Promise<string[]> {
  if (!isMarkdownArchiveFile(name)) return [];
  return [entryPath];
}

async function collectEntryFiles(root: string, entry: Dirent): Promise<string[]> {
  const name = String(entry.name);
  const entryPath = join(root, name);

  if (entry.isDirectory()) return listArchiveFiles(entryPath);
  if (!isFileEntry(entry)) return [];
  return collectFileEntry(entryPath, name);
}

function shouldReclassify(filePath: string, hasCategoryMetadata: boolean): boolean {
  if (!hasCategoryMetadata) return true;
  const relativePath = toPortablePath(relative(ARCHIVE_ROOT, filePath));
  return !relativePath.includes('/');
}

async function reclassifyFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, 'utf-8');
  const parsed = parseArchiveDocument(filePath, content);

  if (!shouldReclassify(filePath, parsed.hasCategoryMetadata)) return;
  await rewriteClassifiedArchive(filePath, parsed);
}

async function rewriteClassifiedArchive(
  filePath: string,
  parsed: ReturnType<typeof parseArchiveDocument>
): Promise<void> {
  const classification = await classifyArchiveDocument({
    title: parsed.title,
    markdown: parsed.body,
  });

  const fileName = filePath.split('/').pop() ?? `${parsed.title}.md`;
  const destinationPath = buildDestinationPath(parsed.title, fileName, classification);
  const nextContent = `${buildFrontMatter(parsed.title, parsed.date, classification)}\n\n${parsed.body}\n`;

  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, nextContent, 'utf-8');

  if (destinationPath !== filePath) {
    await unlink(filePath);
  }
}

async function main(): Promise<void> {
  const files = await listArchiveFiles(ARCHIVE_ROOT);
  for (const filePath of files) {
    await reclassifyFile(filePath);
  }

  await rebuildArchiveIndex();
}

await main();
