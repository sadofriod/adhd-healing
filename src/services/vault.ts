import type { Dirent } from 'fs';
import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { config } from '../config/env.js';
import type { ArchiveClassification } from '../types.js';

const FALLBACK_SAFE_TITLE = 'untitled-idea';
const LOCAL_ARCHIVE_DIRNAME = '.local-vault';
const INDEX_FILENAME = 'index.md';
const UNCATEGORIZED_CATEGORY = 'uncategorized';
const DEFAULT_SUBCATEGORY = 'general';
const DEFAULT_SUMMARY = '未提供摘要';

export type ArchiveMetadata = {
  title: string;
  date: string;
  category: string;
  subcategory: string;
  summary: string;
  tags: string[];
  filePath: string;
  relativePath: string;
};

type ArchiveConversationInput = {
  title: string;
  finalMarkdown: string;
  rawText: string;
  transcript: string;
  classification: ArchiveClassification;
  now?: Date;
};

type ParsedFrontMatter = {
  title: string;
  date: string;
  category: string;
  subcategory: string;
  summary: string;
  tags: string[];
};

function buildSafeTitle(title: string): string {
  const safeTitle = title
    .replace(/[^\w\u4e00-\u9fa5 -]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  if (safeTitle.length > 0) return safeTitle;
  return FALLBACK_SAFE_TITLE;
}

function buildTimestamp(now: Date): string {
  const [, timePart = '000000.000Z'] = now.toISOString().split('T');
  return timePart.replace(/[:.]/g, '').replace('Z', '').slice(0, 9);
}

function sanitizeArchiveSegment(value: string, fallback: string): string {
  const segment = buildSafeTitle(value).toLowerCase();
  if (segment.length > 0) return segment;
  return fallback;
}

function ensureNonEmpty(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 0) return trimmed;
  return fallback;
}

function normalizeTags(tags: readonly string[]): string[] {
  return tags
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function getLocalArchiveRoot(): string {
  return join(process.cwd(), LOCAL_ARCHIVE_DIRNAME);
}

function toPortablePath(path: string): string {
  return path.replace(/\\/g, '/');
}

export function buildVaultFilename(title: string, now: Date = new Date()): string {
  const date = now.toISOString().split('T')[0];
  const timestamp = buildTimestamp(now);
  const safeTitle = buildSafeTitle(title);
  return `${date}-${timestamp}-${safeTitle}.md`;
}

function buildFrontMatter(title: string): string {
  const now = new Date().toISOString();
  const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `---\ntitle: "${escapedTitle}"\ndate: ${now}\ntags: [idea, adhd-healing]\n---\n`;
}

function buildFileContent(title: string, finalMarkdown: string, rawText: string): string {
  const frontMatter = buildFrontMatter(title);
  return `${frontMatter}\n${finalMarkdown}\n\n---\n\n## 原始意识流记录\n\n${rawText}`;
}

function buildArchiveFrontMatter(
  title: string,
  classification: ArchiveClassification,
  now: Date
): string {
  const category = ensureNonEmpty(classification.category, UNCATEGORIZED_CATEGORY);
  const subcategory = ensureNonEmpty(classification.subcategory, DEFAULT_SUBCATEGORY);
  const summary = ensureNonEmpty(classification.summary, DEFAULT_SUMMARY);
  const tags = normalizeTags(classification.tags);

  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${now.toISOString()}`,
    `category: ${JSON.stringify(category)}`,
    `subcategory: ${JSON.stringify(subcategory)}`,
    `summary: ${JSON.stringify(summary)}`,
    `tags: ${JSON.stringify(tags)}`,
    '---',
  ].join('\n');
}

function buildArchiveContent(input: ArchiveConversationInput, now: Date): string {
  const frontMatter = buildArchiveFrontMatter(input.title, input.classification, now);
  return [
    frontMatter,
    '',
    input.finalMarkdown.trim(),
    '',
    '---',
    '',
    '## 对话记录',
    '',
    input.transcript.trim(),
    '',
    '## 原始意识流记录',
    '',
    input.rawText.trim(),
  ].join('\n');
}

function buildArchiveRelativePath(classification: ArchiveClassification, filename: string): string {
  const category = sanitizeArchiveSegment(classification.category, UNCATEGORIZED_CATEGORY);
  const subcategory = sanitizeArchiveSegment(classification.subcategory, DEFAULT_SUBCATEGORY);
  return toPortablePath(join(category, subcategory, filename));
}

function parseJsonFrontMatterValue<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function extractFrontMatter(content: string): string | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match?.[1] ?? null;
}

function extractFrontMatterLine(frontMatter: string, key: string): string | null {
  const pattern = new RegExp(`^${key}:\\s+(.+)$`, 'm');
  const match = frontMatter.match(pattern);
  const value = match?.[1];
  if (!value) return null;
  return value.trim();
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  return parseJsonFrontMatterValue<string[]>(raw, []);
}

function parseStringField(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  return ensureNonEmpty(parseJsonFrontMatterValue<string>(raw, raw), fallback);
}

function parseFrontMatter(content: string): ParsedFrontMatter | null {
  const frontMatter = extractFrontMatter(content);
  if (!frontMatter) return null;

  return {
    title: parseStringField(extractFrontMatterLine(frontMatter, 'title'), FALLBACK_SAFE_TITLE),
    date: parseStringField(extractFrontMatterLine(frontMatter, 'date'), new Date(0).toISOString()),
    category: parseStringField(extractFrontMatterLine(frontMatter, 'category'), UNCATEGORIZED_CATEGORY),
    subcategory: parseStringField(extractFrontMatterLine(frontMatter, 'subcategory'), DEFAULT_SUBCATEGORY),
    summary: parseStringField(extractFrontMatterLine(frontMatter, 'summary'), DEFAULT_SUMMARY),
    tags: parseTags(extractFrontMatterLine(frontMatter, 'tags')),
  };
}

function buildArchiveMetadata(
  filePath: string,
  relativePath: string,
  frontMatter: ParsedFrontMatter | null
): ArchiveMetadata {
  const fallbackTitle = buildSafeTitle(relativePath.replace(/\.md$/i, ''));
  const parsed = frontMatter ?? {
    title: fallbackTitle,
    date: new Date(0).toISOString(),
    category: UNCATEGORIZED_CATEGORY,
    subcategory: DEFAULT_SUBCATEGORY,
    summary: DEFAULT_SUMMARY,
    tags: [],
  };

  return {
    title: parsed.title,
    date: parsed.date,
    category: parsed.category,
    subcategory: parsed.subcategory,
    summary: parsed.summary,
    tags: parsed.tags,
    filePath,
    relativePath: toPortablePath(relativePath),
  };
}

async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const nestedPaths = await Promise.all(entries.map(entry => collectMarkdownEntryPaths(dirPath, entry)));

  return nestedPaths.flat();
}

function getDirentName(entry: Dirent): string {
  return String(entry.name);
}

function isArchiveMarkdownFile(entry: Dirent): boolean {
  if (!entry.isFile()) return false;
  const name = getDirentName(entry);
  if (!name.endsWith('.md')) return false;
  return name !== INDEX_FILENAME;
}

async function collectMarkdownEntryPaths(
  dirPath: string,
  entry: Dirent
): Promise<string[]> {
  const entryPath = join(dirPath, getDirentName(entry));

  if (entry.isDirectory()) return listMarkdownFiles(entryPath);
  if (!isArchiveMarkdownFile(entry)) return [];
  return [entryPath];
}

async function loadArchiveEntries(rootPath: string = getLocalArchiveRoot()): Promise<ArchiveMetadata[]> {
  await mkdir(rootPath, { recursive: true });
  const files = await listMarkdownFiles(rootPath);

  const entries = await Promise.all(files.map(async filePath => {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(rootPath, filePath);
    return buildArchiveMetadata(filePath, relativePath, parseFrontMatter(content));
  }));

  return entries.sort((left, right) => right.date.localeCompare(left.date));
}

function pushGroupedEntry(
  grouped: Map<string, Map<string, ArchiveMetadata[]>>,
  entry: ArchiveMetadata
): void {
  const categoryMap = grouped.get(entry.category) ?? new Map<string, ArchiveMetadata[]>();
  const subcategoryEntries = categoryMap.get(entry.subcategory) ?? [];

  subcategoryEntries.push(entry);
  categoryMap.set(entry.subcategory, subcategoryEntries);
  grouped.set(entry.category, categoryMap);
}

function groupArchiveEntries(entries: readonly ArchiveMetadata[]): Map<string, Map<string, ArchiveMetadata[]>> {
  const grouped = new Map<string, Map<string, ArchiveMetadata[]>>();
  entries.forEach(entry => pushGroupedEntry(grouped, entry));
  return grouped;
}

function formatIndexTags(tags: readonly string[]): string {
  if (tags.length === 0) return '';
  return ` | tags: ${tags.join(', ')}`;
}

function formatIndexDate(value: string): string {
  return value.slice(0, 10);
}

function buildIndexEntryLine(entry: ArchiveMetadata): string {
  const summary = entry.summary.replace(/\s+/g, ' ').trim();
  return `- [${entry.title}](./${entry.relativePath}) | ${formatIndexDate(entry.date)} | ${summary}${formatIndexTags(entry.tags)}`;
}

function buildIndexSubcategorySection(name: string, entries: readonly ArchiveMetadata[]): string[] {
  return [
    `### ${name}`,
    ...entries.map(buildIndexEntryLine),
    '',
  ];
}

function buildIndexCategorySection(category: string, subcategories: Map<string, ArchiveMetadata[]>): string[] {
  const lines = [`## ${category}`, ''];
  const sortedSubcategories = Array.from(subcategories.entries()).sort(([left], [right]) => left.localeCompare(right));

  sortedSubcategories.forEach(([subcategory, entries]) => {
    lines.push(...buildIndexSubcategorySection(subcategory, entries));
  });

  return lines;
}

export function buildArchiveIndexMarkdown(entries: readonly ArchiveMetadata[]): string {
  const header = [
    '# Archive Index',
    '',
    `Updated: ${new Date().toISOString()}`,
    '',
    '按一级分类 / 二级分类归档，可直接用 Markdown 链接跳转到历史对话记录。',
    '',
  ];

  if (entries.length === 0) {
    return [...header, '暂无归档记录。', ''].join('\n');
  }

  const grouped = groupArchiveEntries(entries);
  const sortedCategories = Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  const body = sortedCategories.flatMap(([category, subcategories]) => buildIndexCategorySection(category, subcategories));
  return [...header, ...body].join('\n');
}

export async function rebuildArchiveIndex(): Promise<string> {
  const archiveRoot = getLocalArchiveRoot();
  const entries = await loadArchiveEntries(archiveRoot);
  const indexPath = join(archiveRoot, INDEX_FILENAME);
  const markdown = buildArchiveIndexMarkdown(entries);

  await writeFile(indexPath, markdown, 'utf-8');
  console.log(`[vault] Rebuilt archive index: ${indexPath}`);
  return indexPath;
}

export async function getArchiveTaxonomy(): Promise<{
  categories: string[];
  subcategories: string[];
}> {
  const entries = await loadArchiveEntries();
  const categories = Array.from(new Set(entries.map(entry => entry.category))).sort((left, right) => left.localeCompare(right));
  const subcategories = Array.from(new Set(entries.map(entry => entry.subcategory))).sort((left, right) => left.localeCompare(right));

  return { categories, subcategories };
}

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
