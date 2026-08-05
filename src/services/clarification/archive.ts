import { generateObject } from 'ai';
import { z } from 'zod';
import type {
  ArchiveClassification,
  LlmActivityReporter,
} from '../../types';
import { getLlmClient, CHAT_MODEL } from '../llm-client';
import { reportTokenUsages } from '../token-usage';
import { getArchiveTaxonomy } from '../vault';
import { getArchiveSystemPrompt } from './archive-agent';
import type { ArchiveDocumentInput } from './types';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale';

const MAX_ARCHIVE_SUMMARY_LENGTH = 160;
const ignoreActivity: LlmActivityReporter = () => undefined;

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
  const locale = input.locale ?? DEFAULT_LOCALE;
  if (locale === 'en') {
    return [
      `Title: ${input.title}`,
      '',
      'Final Markdown:',
      input.markdown,
      '',
      'Conversation history (JSON, optional):',
      JSON.stringify(input.sessionMessages ?? []),
      '',
      'Output language rule: category/subcategory/summary/tags must be English.',
    ].join('\n');
  }
  return [
    `标题：${input.title}`,
    '',
    '最终 Markdown：',
    input.markdown,
    '',
    '对话历史（JSON，可为空）：',
    JSON.stringify(input.sessionMessages ?? []),
    '',
    '输出语言规则：category/subcategory/summary/tags 必须使用简体中文。',
  ].join('\n');
}

function getArchiveStartMessage(locale: Locale): string {
  if (locale === 'en') return 'Archive classification started';
  return '归档分类开始执行';
}

function getArchiveCompletedMessage(locale: Locale): string {
  if (locale === 'en') return 'Archive classification completed';
  return '归档分类已完成';
}

function getArchiveUsageSource(locale: Locale): string {
  if (locale === 'en') return 'Archive classification';
  return '归档分类';
}

export async function classifyArchiveDocument(
  input: ArchiveDocumentInput,
  reportActivity: LlmActivityReporter = ignoreActivity
): Promise<ArchiveClassification> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  reportActivity({
    type: 'progress',
    phase: 'sub-agent',
    message: getArchiveStartMessage(locale),
    details: input.title,
  });
  const client = getLlmClient();
  const taxonomy = await getArchiveTaxonomy();
  const result = await generateObject({
    model: client(CHAT_MODEL),
    schema: ArchiveClassificationSchema,
    system: getArchiveSystemPrompt(taxonomy.categories, taxonomy.subcategories),
    prompt: buildArchivePrompt(input),
  });
  reportTokenUsages(getArchiveUsageSource(locale), [result.usage], reportActivity);

  const classification = {
    category: result.object.category,
    subcategory: result.object.subcategory,
    summary: normalizeArchiveSummary(result.object.summary),
    tags: result.object.tags,
  };
  reportActivity({
    type: 'progress',
    phase: 'sub-agent',
    message: getArchiveCompletedMessage(locale),
    details: `${classification.category} / ${classification.subcategory}`,
  });
  return classification;
}