import { afterEach, describe, expect, test } from 'bun:test';
import type { DistillRequest, LlmFinalDecision } from '../types';
import { runDistillOrchestration } from './distill-orchestration';
import {
  deleteSessionHistory,
  listSessionHistory,
  runWithSessionContext,
} from './session';

const REQUEST: DistillRequest = {
  text: '请继续推进调研',
  reset: true,
};

function buildFinalDecision(): LlmFinalDecision {
  return {
    type: 'final',
    message: '结论已收敛，准备归档。',
    markdown: '# 最终方案\n\n可执行结论',
    milestone: '完成样本对比',
    title: '网文平台榜单调研',
    archive: {
      category: '写作',
      subcategory: '网文',
      summary: '归纳榜单调研与正文对比结论',
      tags: ['调研', '网文'],
    },
    researchTopics: [],
    researchArtifacts: [],
  };
}

afterEach(deleteSessionHistory);

describe('runDistillOrchestration auto continuation', () => {
  test('continues automatically from note to final within one request', async () => {
    const checkpoints: string[] = [];
    const progressMessages: string[] = [];
    let decisionCalls = 0;

    const response = await runWithSessionContext(async () => runDistillOrchestration(
      REQUEST,
      event => {
        if (event.type !== 'progress') return;
        progressMessages.push(event.message);
      },
      {
        makeDecision: async (_session, _locale, _report, progress) => {
          decisionCalls += 1;
          if (decisionCalls === 1) {
            expect(progress).toBeUndefined();
            return {
              type: 'note',
              message: '已完成首轮样本扫描，继续自动整合。',
            };
          }

          expect(progress).toEqual({
            type: 'progress',
            phase: 'process',
            message: '已完成首轮样本扫描，继续自动整合。',
          });
          return buildFinalDecision();
        },
        persistDistillCheckpoint: async input => {
          checkpoints.push(input.decision.type);
        },
        runFinalizeWritePipeline: async () => ({
          directoryPath: '/tmp/idea',
          mainLink: 'obsidian://idea',
        }),
      }
    ));

    expect(response.status).toBe('FINISH');
    expect(decisionCalls).toBe(2);
    expect(checkpoints).toEqual(['note']);
    expect(progressMessages).toContain('基于当前阶段陈述继续自动执行');

    const sessions = await runWithSessionContext(async () => listSessionHistory());
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe('FINISHED');
    expect(sessions[0]?.messages.at(-1)?.content).toBe('结论已收敛，准备归档。');
  });
});