import { loadAgentPrompt } from './agent.js';

const ARCHIVE_AGENT_PROMPT = loadAgentPrompt(new URL('./agents/archive.agent.md', import.meta.url));

function getCategoryContext(existingCategories: readonly string[]): string {
  if (existingCategories.length > 0) {
    return `已有一级分类：${existingCategories.join('、')}`;
  }

  return '当前还没有既有一级分类，可新建最稳定的一级分类。';
}

function getSubcategoryContext(existingSubcategories: readonly string[]): string {
  if (existingSubcategories.length > 0) {
    return `已有二级分类：${existingSubcategories.join('、')}`;
  }

  return '当前还没有既有二级分类，可新建最稳定的二级分类。';
}

export function getArchiveSystemPrompt(
  existingCategories: readonly string[],
  existingSubcategories: readonly string[]
): string {
  return ARCHIVE_AGENT_PROMPT
    .replace('{existingCategories}', getCategoryContext(existingCategories))
    .replace('{existingSubcategories}', getSubcategoryContext(existingSubcategories));
}