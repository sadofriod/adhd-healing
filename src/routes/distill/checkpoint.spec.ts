import { describe, expect, test } from 'bun:test';
import type { ObsidianWriteOptions, ObsidianWriteResult } from '../../services/obsidian-writer';
import { persistDistillCheckpoint } from './checkpoint';

describe('persistDistillCheckpoint', () => {
  test('writes checkpoints under .local-vault root instead of the artifact folder', async () => {
    const calls: Array<{
      path: string;
      content: string;
      options: ObsidianWriteOptions | undefined;
    }> = [];

    const writer = async (
      path: string,
      content: string,
      options?: ObsidianWriteOptions
    ): Promise<ObsidianWriteResult> => {
      calls.push({ path, content, options });
      return { backend: 'cli', path };
    };

    await persistDistillCheckpoint({
      decision: {
        type: 'progress',
        phase: 'tool-call',
        message: '正在分析仓库并调用工具',
      },
      session: [{ role: 'user', content: '回溯者第一卷角色精简与文风去AI化' }],
      now: new Date('2026-08-05T03:37:15.922Z'),
    }, writer);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.path).toBe(
      '.local-vault/_session-checkpoints/回溯者第一卷角色精简与文风去AI化-checkpoint-ojeyzdtq.md'
    );
    expect(calls[0]!.options?.vaultPath).toBeDefined();
    expect(calls[0]!.content).toContain('当前结论: 正在分析仓库并调用工具');
  });
});