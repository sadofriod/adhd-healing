import { describe, expect, test } from 'bun:test';
import type {
  DistillRequest,
  LlmClarifyDecision,
  LlmFinalDecision,
  LlmProgressDecision,
} from '../../types';
import { processDistill } from './process';

const REQUEST: DistillRequest = {
  text: '分析这个仓库',
  reset: true,
};

function buildFinalDecision(includeResearchTopics: boolean): LlmFinalDecision {
  return {
    type: 'final',
    message: '已形成最终决策',
    markdown: '# 脑暴归档\n\n内容',
    milestone: '补齐仓库分析',
    title: '仓库分析',
    archive: {
      category: '分析',
      subcategory: '仓库',
      summary: '仓库分析摘要',
      tags: ['分析', '仓库'],
    },
    researchTopics: includeResearchTopics ? [{
      title: '许可证边界',
      scope: 'AGPL 与 SaaS 边界',
      relevance: '决定商业化路径',
      executionGoal: '产出可执行改造清单',
    }] : [],
    researchArtifacts: [],
  };
}

describe('processDistill', () => {
  test('runs deep research before finalization when the final decision includes research topics', async () => {
    const researchInputs: Array<{ title: string; topics: LlmFinalDecision['researchTopics'] }> = [];
    let finalizeInput: { researchArtifacts: readonly unknown[] } | undefined;

    const response = await processDistill(REQUEST, () => undefined, {
      makeDecision: async () => buildFinalDecision(true),
      runDeepResearch: async input => {
        researchInputs.push({ title: input.mainTitle, topics: input.topics });
        return [{
          title: '许可证边界',
          markdown: '# 深度调研\n## 执行结论\n结论\n## 实施步骤\n步骤\n## 风险与验证\n验证',
          summary: '调研摘要',
          tags: ['调研', '许可证'],
        }];
      },
      runFinalizeWritePipeline: async input => {
        finalizeInput = {
          researchArtifacts: input.researchArtifacts,
        };
        return {
          directoryPath: '/tmp/idea',
          mainLink: 'obsidian://idea',
        };
      },
    });

    expect(response.status).toBe('FINISH');
    expect(response.text).toContain('obsidian://idea');
    expect(researchInputs).toEqual([{
      title: '仓库分析',
      topics: buildFinalDecision(true).researchTopics,
    }]);
    expect(finalizeInput?.researchArtifacts).toHaveLength(1);
  });

  test('skips deep research when the final decision has no research topics', async () => {
    let runDeepResearchCalled = false;
    let finalizeResearchArtifacts: readonly unknown[] | undefined;

    const response = await processDistill(REQUEST, () => undefined, {
      makeDecision: async () => buildFinalDecision(false),
      runDeepResearch: async () => {
        runDeepResearchCalled = true;
        return [];
      },
      runFinalizeWritePipeline: async input => {
        finalizeResearchArtifacts = input.researchArtifacts;
        return {
          directoryPath: '/tmp/idea',
          mainLink: 'obsidian://idea',
        };
      },
    });

    expect(response.status).toBe('FINISH');
    expect(runDeepResearchCalled).toBeFalse();
    expect(finalizeResearchArtifacts).toEqual([]);
  });

  test('persists a stage checkpoint for non-final decisions', async () => {
    const checkpoints: Array<{ decision: LlmClarifyDecision | LlmProgressDecision; size: number }> = [];

    const response = await processDistill(REQUEST, () => undefined, {
      makeDecision: async () => ({
        type: 'progress',
        phase: 'tool-call',
        message: '正在分析仓库并调用工具',
      }),
      persistDistillCheckpoint: async input => {
        checkpoints.push({ decision: input.decision, size: input.session.length });
      },
    });

    expect(response.status).toBe('CONTINUE');
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toEqual({
      decision: {
        type: 'progress',
        phase: 'tool-call',
        message: '正在分析仓库并调用工具',
      },
      size: 1,
    });
  });

  test('does not persist a stage checkpoint after final decisions', async () => {
    let checkpointCalled = false;

    const response = await processDistill(REQUEST, () => undefined, {
      makeDecision: async () => buildFinalDecision(false),
      persistDistillCheckpoint: async () => {
        checkpointCalled = true;
      },
      runFinalizeWritePipeline: async () => ({
        directoryPath: '/tmp/idea',
        mainLink: 'obsidian://idea',
      }),
    });

    expect(response.status).toBe('FINISH');
    expect(checkpointCalled).toBeFalse();
  });
});
