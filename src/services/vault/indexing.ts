import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { ArchiveMetadata } from './metadata';
import { getLocalArchiveRoot } from './filename';

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

function pushGroupedEntry(grouped: Map<string, Map<string, ArchiveMetadata[]>>, entry: ArchiveMetadata): void {
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
  const { loadArchiveEntries } = await import('./metadata');
  const entries = await loadArchiveEntries(archiveRoot);
  const indexPath = join(archiveRoot, 'index.md');
  const markdown = buildArchiveIndexMarkdown(entries);

  await writeFile(indexPath, markdown, 'utf-8');
  console.log(`[vault] Rebuilt archive index: ${indexPath}`);
  return indexPath;
}
