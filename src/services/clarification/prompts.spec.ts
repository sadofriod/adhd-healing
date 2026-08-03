import { describe, expect, test } from 'bun:test';
import { buildDecisionPrompt } from './prompts';

describe('clarification session research memory prompt', () => {
  test('injects completed research evidence for reuse', () => {
    const prompt = buildDecisionPrompt(
      [{ role: 'user', content: '分析仓库商业化方向' }],
      undefined,
      [{
        key: 'github_get_file_contents:readme',
        toolName: 'github_get_file_contents（MCP）',
        input: { owner: 'sadofriod', repo: 'agent-company', path: 'README.md' },
        output: { content: '# Agent Company' },
      }]
    );

    expect(prompt).toContain('Session 调研记忆');
    expect(prompt).toContain('github_get_file_contents（MCP）');
    expect(prompt).toContain('README.md');
    expect(prompt).toContain('# Agent Company');
    expect(prompt).toContain('相同工具且 input 语义相同的查询必须直接复用');
  });

  test('omits the memory instruction when no evidence exists', () => {
    const prompt = buildDecisionPrompt([]);

    expect(prompt).not.toContain('Session 调研记忆');
  });
});
