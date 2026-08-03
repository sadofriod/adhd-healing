import { afterEach, describe, expect, test } from 'bun:test';
import type { LlmActivityEvent } from '../types';
import { deleteSessionHistory, getSessionResearchMemory } from './session';
import { rememberCompressedSessionResearch } from './session-memory';

afterEach(deleteSessionHistory);

describe('session memory compression', () => {
  test('uses an LLM compressor for long output and stores only its summary', async () => {
    const events: LlmActivityEvent[] = [];
    let receivedOutput: unknown;

    await rememberCompressedSessionResearch({
      toolName: 'github_get_file_contents（MCP）',
      input: { path: 'README.md' },
      output: { content: 'x'.repeat(2_100), tailFact: 'MIT license missing' },
    }, event => events.push(event), async evidence => {
      receivedOutput = evidence.output;
      return {
        text: 'README 较长；关键事实：仓库尚未提供 MIT license。',
        usage: { inputTokens: 600, outputTokens: 40, totalTokens: 640 },
      };
    });

    expect(receivedOutput).toEqual({
      content: 'x'.repeat(2_100),
      tailFact: 'MIT license missing',
    });
    expect(getSessionResearchMemory()[0]?.output).toBe(
      'README 较长；关键事实：仓库尚未提供 MIT license。'
    );
    expect(events.map(event => event.type)).toEqual(['progress', 'usage']);
  });

  test('stores short output without invoking the compressor', async () => {
    let compressionCalls = 0;

    await rememberCompressedSessionResearch({
      toolName: 'github_get_repo（MCP）',
      input: { repo: 'agent-company' },
      output: { stars: 12 },
    }, () => undefined, async () => {
      compressionCalls += 1;
      return { text: '不应调用' };
    });

    expect(compressionCalls).toBe(0);
    expect(getSessionResearchMemory()[0]?.output).toEqual({ stars: 12 });
  });
});
