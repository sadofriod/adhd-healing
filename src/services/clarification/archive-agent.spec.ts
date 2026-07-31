import { describe, expect, test } from 'bun:test';
import { getArchiveSystemPrompt } from './archive-agent.js';

describe('archive agent prompt', () => {
  test('injects the existing taxonomy into the Agent Markdown body', () => {
    const prompt = getArchiveSystemPrompt(['AI工作流'], ['提示词工程']);

    expect(prompt).toContain('已有一级分类：AI工作流');
    expect(prompt).toContain('已有二级分类：提示词工程');
    expect(prompt).toContain('## 输出字段');
    expect(prompt).not.toContain('description:');
  });

  test('describes empty taxonomy dimensions', () => {
    const prompt = getArchiveSystemPrompt([], []);

    expect(prompt).toContain('当前还没有既有一级分类');
    expect(prompt).toContain('当前还没有既有二级分类');
  });
});