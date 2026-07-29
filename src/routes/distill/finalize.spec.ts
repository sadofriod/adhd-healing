import { describe, expect, it } from 'bun:test';
import {
  getAssistantRecordContent,
  getResponseTurnIndex,
  runFinalizeWritePipeline,
} from './finalize.js';

describe('finalize helpers', () => {
  it('stores the full markdown for final assistant records', () => {
    expect(
      getAssistantRecordContent({
        type: 'final',
        message: '蒸馏完成',
        markdown: '### 🎯 今日灵感内核\n完整输出',
      })
    ).toBe('### 🎯 今日灵感内核\n完整输出');
  });

  it('returns the current clarification round for clarify responses', () => {
    expect(getResponseTurnIndex(0, { type: 'clarify', message: '继续补充约束？' })).toBe(1);
    expect(getResponseTurnIndex(2, { type: 'clarify', message: '再补充成功标准？' })).toBe(3);
  });

  it('keeps the current turn count for final responses', () => {
    expect(
      getResponseTurnIndex(3, {
        type: 'final',
        message: '蒸馏完成',
        markdown: '### 🎯 今日灵感内核\n完整输出',
      })
    ).toBe(3);
  });

  it('marks completed after all writes finish', async () => {
    const calls: string[] = [];

    await runFinalizeWritePipeline({
      writeToVault: async () => {
        calls.push('vault');
      },
      writeIdeaRecord: async () => {
        calls.push('idea');
      },
      syncReminder: async () => {
        calls.push('reminder');
      },
      commitSessionCompletion: async () => {
        calls.push('completed');
      },
    });

    expect(calls).toEqual(['vault', 'idea', 'reminder', 'completed']);
  });

  it('does not mark completed when an earlier write fails', async () => {
    const calls: string[] = [];

    await expect(
      runFinalizeWritePipeline({
        writeToVault: async () => {
          calls.push('vault');
        },
        writeIdeaRecord: async () => {
          calls.push('idea');
          throw new Error('idea insert failed');
        },
        syncReminder: async () => {
          calls.push('reminder');
        },
        commitSessionCompletion: async () => {
          calls.push('completed');
        },
      })
    ).rejects.toThrow('idea insert failed');

    expect(calls).toEqual(['vault', 'idea']);
  });
});