import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
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

beforeEach(deleteSessionHistory);
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

  test('keeps auto-continuing beyond six progress rounds until a real clarify decision appears', async () => {
    let decisionCalls = 0;

    const response = await runWithSessionContext(async () => runDistillOrchestration(
      REQUEST,
      () => undefined,
      {
        makeDecision: async () => {
          decisionCalls += 1;
          if (decisionCalls <= 7) {
            return {
              type: 'progress',
              phase: 'tool-call',
              message: `继续执行第 ${decisionCalls} 轮`,
            };
          }

          return {
            type: 'clarify',
            message: '请确认你优先要保留哪类证据？',
          };
        },
        persistDistillCheckpoint: async () => undefined,
      }
    ));

    expect(response.status).toBe('CONTINUE');
    expect(response.text).toBe('请确认你优先要保留哪类证据？');
    expect(decisionCalls).toBe(8);
  });

  test('pauses automatically when the internal auto-continue deadline is exceeded', async () => {
    let decisionCalls = 0;

    const response = await runWithSessionContext(async () => runDistillOrchestration(
      REQUEST,
      () => undefined,
      {
        autoContinueDeadlineMs: 10,
        makeDecision: async () => {
          decisionCalls += 1;
          if (decisionCalls === 1) {
            return {
              type: 'progress',
              phase: 'tool-call',
              message: '正在调用慢速工具',
            };
          }

          await new Promise(resolve => setTimeout(resolve, 30));
          return buildFinalDecision();
        },
        persistDistillCheckpoint: async () => undefined,
      }
    ));

    expect(response.status).toBe('PAUSED');
    expect(response.text).toBe('自动续跑超过内部时限 10ms。');
    expect(decisionCalls).toBe(2);
  });

  test('pauses automatically when the same intermediate decision stalls repeatedly', async () => {
    let decisionCalls = 0;

    const response = await runWithSessionContext(async () => runDistillOrchestration(
      REQUEST,
      () => undefined,
      {
        maxAutoContinueStallCount: 3,
        makeDecision: async () => {
          decisionCalls += 1;
          return {
            type: 'progress',
            phase: 'tool-call',
            message: '继续等待同一个工具结果',
          };
        },
        persistDistillCheckpoint: async () => undefined,
      }
    ));

    expect(response.status).toBe('PAUSED');
    expect(response.text).toBe('自动续跑连续 3 次重复相同的中间决策。');
    expect(decisionCalls).toBe(3);
  });

});