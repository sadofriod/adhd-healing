import { readFileSync } from 'fs';

const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const AGENT_PROMPT_URL = new URL('./agents/clarification.agent.md', import.meta.url);

export function extractAgentPrompt(markdown: string): string {
  return markdown.replace(FRONTMATTER_PATTERN, '').trim();
}

export function loadAgentPrompt(url: URL): string {
  return extractAgentPrompt(readFileSync(url, 'utf8'));
}

export const SYSTEM_PROMPT = loadAgentPrompt(AGENT_PROMPT_URL);