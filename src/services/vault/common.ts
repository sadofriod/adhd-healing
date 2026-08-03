export const FALLBACK_SAFE_TITLE = 'untitled-idea';
export const UNCATEGORIZED_CATEGORY = 'uncategorized';
export const DEFAULT_SUBCATEGORY = 'general';
export const DEFAULT_SUMMARY = '未提供摘要';

export function ensureNonEmpty(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 0) return trimmed;
  return fallback;
}

export function normalizeTags(tags: readonly string[]): string[] {
  return tags
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
}
