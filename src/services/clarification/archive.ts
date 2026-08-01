import { generateObject } from 'ai';
import { z } from 'zod';
import type { ArchiveClassification } from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { getArchiveTaxonomy } from '../vault';
import { getArchiveSystemPrompt } from './archive-agent';
import type { ArchiveDocumentInput } from './types';

const MAX_ARCHIVE_SUMMARY_LENGTH = 160;

const ArchiveClassificationSchema = z.object({
  category: z.string().trim().min(1).max(40),
  subcategory: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1).max(30)).min(2).max(8),
});

export function normalizeArchiveSummary(summary: string): string {
  return Array.from(summary.trim()).slice(0, MAX_ARCHIVE_SUMMARY_LENGTH).join('');
}

function buildArchivePrompt(input: ArchiveDocumentInput): string {
  return [
    `标题：${input.title}`,
    '',
    '最终 Markdown：',
    input.markdown,
    '',
    '对话历史（JSON，可为空）：',
    JSON.stringify(input.sessionMessages ?? []),
  ].join('\n');
}

export async function classifyArchiveDocument(
  input: ArchiveDocumentInput
): Promise<ArchiveClassification> {
  const client = getLlmClient();
  const taxonomy = await getArchiveTaxonomy();
  const { object } = await generateObject({
    model: client(CHAT_MODEL),
    schema: ArchiveClassificationSchema,
    system: getArchiveSystemPrompt(taxonomy.categories, taxonomy.subcategories),
    prompt: buildArchivePrompt(input),
  });

  return {
    category: object.category,
    subcategory: object.subcategory,
    summary: normalizeArchiveSummary(object.summary),
    tags: object.tags,
  };
}