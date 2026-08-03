import type { ArchiveClassification } from '../../types';
import { DEFAULT_SUBCATEGORY, DEFAULT_SUMMARY, ensureNonEmpty, normalizeTags, UNCATEGORIZED_CATEGORY } from './common';

export type ArchiveConversationInput = {
  title: string;
  finalMarkdown: string;
  rawText: string;
  transcript: string;
  classification: ArchiveClassification;
  now?: Date;
};

export function buildFrontMatter(title: string): string {
  const now = new Date().toISOString();
  const escapedTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  return `---\ntitle: "${escapedTitle}"\ndate: ${now}\ntags: [idea, adhd-healing]\n---\n`;
}

export function buildFileContent(title: string, finalMarkdown: string, rawText: string): string {
  const frontMatter = buildFrontMatter(title);
  return `${frontMatter}\n${finalMarkdown}\n\n---\n\n## 原始意识流记录\n\n${rawText}`;
}

export function buildArchiveFrontMatter(
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

export function buildArchiveContent(input: ArchiveConversationInput, now: Date): string {
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
