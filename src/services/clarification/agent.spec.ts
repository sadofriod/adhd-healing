import { describe, expect, test } from 'bun:test';
import { extractAgentPrompt, SYSTEM_PROMPT } from './agent';

describe('clarification agent prompt', () => {
  test('loads the prompt body without Agent Markdown frontmatter', () => {
    expect(SYSTEM_PROMPT).toStartWith('你是一个顶级的设计大脑催产师。');
    expect(SYSTEM_PROMPT).toContain('## 工作规则');
    expect(SYSTEM_PROMPT).not.toContain('user-invocable:');
  });

  test('supports CRLF Agent Markdown files', () => {
    const markdown = '---\r\ndescription: "test"\r\n---\r\n\r\nPrompt body\r\n';
    expect(extractAgentPrompt(markdown)).toBe('Prompt body');
  });
});