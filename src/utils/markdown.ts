const TODAY_HEADER = '### 🎯 今日灵感内核';
const RAG_HEADER = '### 🔄 历史思维连线 (RAG 检索结果)';
const MILESTONE_HEADER = '### 🚀 20分钟强制里程碑 (Milestone)';
const DEFAULT_TITLE = '未命名想法';
const DEFAULT_KERNEL = '暂无可用蒸馏结果';
const DEFAULT_MILESTONE = '明确 20 分钟第一步\n- 写下第一个可执行动作';
const DEFAULT_REMINDER_STEPS = '- 写下第一个可执行动作';
const DEFAULT_RAG_REFERENCE_MILESTONE = '未提取到里程碑';
const MAX_TITLE_LENGTH = 30;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimMatchGroup(match: RegExpMatchArray | null, group: number): string | null {
  if (!match) return null;
  const value = match[group];
  return value ? value.trim() : null;
}

function stripMarkdownDecorators(value: string): string {
  return value
    .replace(/^[-*]\s+/, '')
    .replace(/^\[\s?\]\s*/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .trim();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeSectionLine(value: string): string {
  return collapseWhitespace(stripMarkdownDecorators(value));
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[。！？!?；;：:，,]+$/g, '').trim();
}

function limitTitleLength(value: string): string {
  if (value.length <= MAX_TITLE_LENGTH) return value;
  return value.slice(0, MAX_TITLE_LENGTH).trimEnd();
}

function normalizeTitleCandidate(value: string): string {
  const stripped = collapseWhitespace(stripMarkdownDecorators(value));
  const [firstSentence] = stripped.split(/[。！？!?]/);
  return stripTrailingPunctuation(firstSentence?.trim() ?? stripped);
}

function toBriefTitle(value: string, fallback: string): string {
  const normalized = normalizeTitleCandidate(value);
  if (normalized.length === 0) return fallback;
  return limitTitleLength(normalized) || fallback;
}

function getSectionLines(section: string): string[] {
  return section
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function getSectionTitle(section: string, fallback: string): string {
  const [firstLine] = getSectionLines(section);
  if (!firstLine) return fallback;
  return toBriefTitle(firstLine, fallback);
}

function getSectionDetails(section: string): string {
  const detailLines = getSectionLines(section)
    .slice(1, 3)
    .map(normalizeSectionLine)
    .filter(Boolean);

  return detailLines.join(' ');
}

function getMilestoneSteps(section: string): string {
  const lines = getSectionLines(section);
  if (lines.length === 0) return DEFAULT_REMINDER_STEPS;
  if (lines.length === 1) return lines[0];
  return lines.slice(1).join('\n');
}

export function extractSection(mdText: string, header: string): string | null {
  const escaped = escapeRegex(header);
  const pattern = new RegExp(`(?:^|\\r?\\n)${escaped}\\r?\\n([\\s\\S]*?)(?=\\r?\\n###\\s|$)`, 'i');
  return trimMatchGroup(mdText.match(pattern), 1);
}

export function extractTitle(mdText: string): string {
  const section = extractSection(mdText, TODAY_HEADER);
  if (!section) return DEFAULT_TITLE;
  return getSectionTitle(section, DEFAULT_TITLE);
}

export function extractMilestone(mdText: string): string | null {
  const section = extractSection(mdText, MILESTONE_HEADER);
  if (!section) return null;
  return getSectionTitle(section, DEFAULT_TITLE);
}

export function buildReminderDescription(mdText: string): string {
  const summary = extractTitle(mdText);
  const milestoneSection = extractSection(mdText, MILESTONE_HEADER);
  const detailedSteps = milestoneSection
    ? getMilestoneSteps(milestoneSection)
    : DEFAULT_REMINDER_STEPS;

  return [
    '## 总结',
    summary,
    '',
    '## 详细步骤',
    detailedSteps,
    '',
    '## 完整蒸馏输出',
    mdText.trim(),
  ].join('\n');
}

function getKernelDetails(mdText: string): string {
  const section = extractSection(mdText, TODAY_HEADER);
  if (!section) return '';
  return getSectionDetails(section);
}

function buildDetailsLine(details: string): string | null {
  if (!details) return null;
  return `相关想法摘要：${details}`;
}

export function buildRagReference(mdText: string): string {
  const title = extractTitle(mdText);
  const rawMilestone = extractMilestone(mdText);
  const milestone = rawMilestone ?? DEFAULT_RAG_REFERENCE_MILESTONE;
  const details = getKernelDetails(mdText);

  return [
    `相关想法标题：${title}`,
    buildDetailsLine(details),
    `相关想法里程碑：${milestone}`,
  ].filter(Boolean).join('\n');
}

function buildSection(header: string, content: string): string {
  return `${header}\n${content.trim()}`;
}

function resolveFallbackKernel(mdText: string): string {
  const trimmed = mdText.trim();
  if (trimmed.length > 0) return trimmed;
  return DEFAULT_KERNEL;
}

function resolveNormalizedRagContext(ragContext: string): string {
  const trimmed = ragContext.trim();
  if (trimmed.length > 0) return trimmed;
  return '无相关历史记录';
}

function resolveSectionContent(mdText: string, header: string, fallback: string): string {
  const section = extractSection(mdText, header);
  if (section) return section;
  return fallback;
}

function buildNormalizedMarkdown(mdText: string, ragContext: string): string {
  const kernel = resolveSectionContent(mdText, TODAY_HEADER, resolveFallbackKernel(mdText));
  const rag = resolveSectionContent(mdText, RAG_HEADER, resolveNormalizedRagContext(ragContext));
  const milestone = resolveSectionContent(mdText, MILESTONE_HEADER, DEFAULT_MILESTONE);

  return [
    buildSection(TODAY_HEADER, kernel),
    '',
    buildSection(RAG_HEADER, rag),
    '',
    buildSection(MILESTONE_HEADER, milestone),
  ].join('\n');
}

export function normalizeFinalMarkdown(mdText: string, ragContext: string): string {
  return buildNormalizedMarkdown(mdText, ragContext).trim();
}
