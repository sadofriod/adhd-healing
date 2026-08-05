import { describe, expect, test } from 'bun:test';
import type {
  DistillRequest,
  LlmClarifyDecision,
  LlmFinalDecision,
  LlmNoteDecision,
  LlmProgressDecision,
} from '../../types';
import { processDistill } from './process';

const REQUEST: DistillRequest = {
  text: '分析这个仓库',
  reset: true,
};

const EN_REQUEST: DistillRequest = {
  text: 'Analyze this repository',
  reset: true,
  locale: 'en',
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
    let finalizeInput: {
      sessionId: string;
      researchArtifacts: readonly unknown[];
    } | undefined;

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
          sessionId: input.sessionId,
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
    expect(finalizeInput?.sessionId).toBe(response.sessionId);
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

  test('auto-continues progress decisions until a user-reply clarify decision appears', async () => {
    const checkpoints: Array<{ decision: LlmClarifyDecision | LlmNoteDecision | LlmProgressDecision; size: number }> = [];
    let attempts = 0;

    const response = await processDistill(REQUEST, () => undefined, {
      makeDecision: async () => {
        attempts += 1;
        if (attempts === 1) {
          return {
            type: 'progress',
            phase: 'tool-call',
            message: '正在分析仓库并调用工具',
          };
        }
        return {
          type: 'clarify',
          message: '请确认你最看重哪一个目标？',
        };
      },
      persistDistillCheckpoint: async input => {
        checkpoints.push({ decision: input.decision, size: input.session.length });
      },
    });

    expect(response.status).toBe('CONTINUE');
    expect(response.text).toBe('请确认你最看重哪一个目标？');
    expect(attempts).toBe(2);
    expect(checkpoints).toHaveLength(2);
    expect(checkpoints[0]).toEqual({
      decision: {
        type: 'progress',
        phase: 'tool-call',
        message: '正在分析仓库并调用工具',
      },
      size: 1,
    });
    expect(checkpoints[1]).toEqual({
      decision: {
        type: 'clarify',
        message: '请确认你最看重哪一个目标？',
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

  test('auto-continues note decisions and can still finalize in the same request', async () => {
    let attempts = 0;

    const response = await processDistill(REQUEST, () => undefined, {
      makeDecision: async () => {
        attempts += 1;
        if (attempts === 1) return { type: 'note', message: '已完成榜单采样，继续整合对比。' };
        return buildFinalDecision(false);
      },
      runFinalizeWritePipeline: async () => ({
        directoryPath: '/tmp/idea',
        mainLink: 'obsidian://idea',
      }),
    });

    expect(response.status).toBe('FINISH');
    expect(attempts).toBe(2);
  });

  test('returns english final text and propagates english locale to deep research', async () => {
    const progressMessages: string[] = [];
    let deepResearchLocale: DistillRequest['locale'] | undefined;

    const response = await processDistill(EN_REQUEST, event => {
      if (event.type !== 'progress') return;
      progressMessages.push(event.message);
    }, {
      makeDecision: async () => buildFinalDecision(true),
      runDeepResearch: async input => {
        deepResearchLocale = input.locale;
        return [{
          title: 'License boundary',
          markdown: '# Deep Research\n## Execution Conclusions\nConclusion\n## Implementation Steps\nSteps\n## Risks And Validation\nValidation',
          summary: 'Research summary',
          tags: ['research', 'license'],
        }];
      },
      runFinalizeWritePipeline: async () => ({
        directoryPath: '/tmp/idea',
        mainLink: 'obsidian://idea',
      }),
    });

    expect(response.status).toBe('FINISH');
    expect(response.text).toContain('Distillation complete!');
    expect(response.text).toContain('Archived to Obsidian via MCP: obsidian://idea');
    expect(response.text).toContain('Deep research reports: 1');
    expect(deepResearchLocale).toBe('en');
    expect(progressMessages).toContain('Started processing current user input.');
    expect(progressMessages).toContain('Persisting Obsidian artifacts via MCP and creating reminders');
    expect(progressMessages).toContain('Final output persisted. Closing current session.');
  });
});
