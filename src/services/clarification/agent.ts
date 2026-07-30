import { readFileSync } from 'node:fs';
import { config } from '../../config/env.js';

type ClarificationPromptMode = 'clarify' | 'final';
type AgentSectionName =
  | 'Shared Rules'
  | 'Clarify Mode'
  | 'Final Mode'
  | 'Output Contract'
  | 'Completion Fallback';

const AGENT_SPEC_PATH = new URL('./clarification.agent.md', import.meta.url);

function interpolatePlaceholders(content: string): string {
  return content.replaceAll(
    '{{MAX_CLARIFICATION_TURNS}}',
    String(config.maxClarificationTurns)
  );
}

function parseAgentSections(markdown: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string[]>();
  let currentSection: string | null = null;

  markdown.split(/\r?\n/).forEach(line => {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
      sections.set(currentSection, []);
      return;
    }

    if (!currentSection) return;

    const sectionLines = sections.get(currentSection);
    if (!sectionLines) return;
    sectionLines.push(line);
  });

  return new Map(
    Array.from(sections.entries()).map(([name, sectionLines]) => {
      return [name, interpolatePlaceholders(sectionLines.join('\n').trim())];
    })
  );
}

const agentSections = parseAgentSections(readFileSync(AGENT_SPEC_PATH, 'utf8'));

function getAgentSection(name: AgentSectionName): string {
  const content = agentSections.get(name);
  if (!content) {
    throw new Error(`[clarification] Missing agent section: ${name}`);
  }

  return content;
}

function joinPromptSections(sectionNames: readonly AgentSectionName[]): string {
  return sectionNames.map(getAgentSection).join('\n\n').trim();
}

export function getClarificationSystemPrompt(mode: ClarificationPromptMode): string {
  if (mode === 'clarify') {
    return joinPromptSections(['Shared Rules', 'Clarify Mode', 'Output Contract']);
  }

  return joinPromptSections(['Shared Rules', 'Final Mode', 'Output Contract']);
}

export function getCompletionFallbackNotes(): string {
  return getAgentSection('Completion Fallback');
}