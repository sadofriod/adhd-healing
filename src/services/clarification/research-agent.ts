import { loadAgentPrompt } from './agent';

const RESEARCH_AGENT_PROMPT = loadAgentPrompt(
  new URL('./agents/research.agent.md', import.meta.url)
);

export function getResearchSystemPrompt(): string {
  return RESEARCH_AGENT_PROMPT;
}
