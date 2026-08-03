import type { Dirent } from 'fs';
import { mkdir, readdir, readFile } from 'fs/promises';
import { join, relative } from 'path';
import {
  DEFAULT_SUBCATEGORY,
  DEFAULT_SUMMARY,
  ensureNonEmpty,
  FALLBACK_SAFE_TITLE,
  UNCATEGORIZED_CATEGORY,
} from './common';
import { buildSafeTitle, getLocalArchiveRoot, toPortablePath } from './filename';

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

type ParsedFrontMatter = {
  title: string;
  date: string;
  category: string;
  subcategory: string;
  summary: string;
  tags: string[];
};

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

export function parseFrontMatter(content: string): ParsedFrontMatter | null {
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

export function buildArchiveMetadata(
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
  return name !== 'index.md';
}

async function collectMarkdownEntryPaths(dirPath: string, entry: Dirent): Promise<string[]> {
  const entryPath = join(dirPath, getDirentName(entry));

  if (entry.isDirectory()) return listMarkdownFiles(entryPath);
  if (!isArchiveMarkdownFile(entry)) return [];
  return [entryPath];
}

export async function loadArchiveEntries(rootPath: string = getLocalArchiveRoot()): Promise<ArchiveMetadata[]> {
  await mkdir(rootPath, { recursive: true });
  const files = await listMarkdownFiles(rootPath);

  const entries = await Promise.all(files.map(async filePath => {
    const content = await readFile(filePath, 'utf-8');
    const relativePath = relative(rootPath, filePath);
    return buildArchiveMetadata(filePath, relativePath, parseFrontMatter(content));
  }));

  return entries.sort((left, right) => right.date.localeCompare(left.date));
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
