import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { DistillRequestData, IdeaRow, LlmDecision, Session } from '../../types.js';

type SessionArtifacts = {
  sessionContext: string;
  rawText: string;
};

type TestState = {
  loadOrCreateSessionResponses: Session[];
  transcribedText: string;
  sessionArtifacts: SessionArtifacts;
  decision: LlmDecision;
  similarIdeas: IdeaRow[];
  saveToLocalVaultError: Error | null;
  syncReminderError: Error | null;
};

type TestCalls = {
  loadOrCreateSession: Array<[string | undefined]>;
  transcribeAudio: Array<[Buffer, { fileName?: string; mimeType?: string }]>
  insertMessage: Array<[string, 'user' | 'assistant', 'audio' | 'text' | 'system', string]>;
  advanceTurn: string[];
  buildSessionArtifacts: string[];
  getEmbedding: string[];
  formatVectorForPg: number[][];
  findSimilarIdeas: Array<[string, number]>;
  makeDecision: Array<[Session, string, string]>;
  saveToLocalVault: Array<[string, string, string]>;
  insertIdea: Array<[string, string, string]>;
  syncToAppleReminders: Array<[string, string]>;
  completeSessionWithFinalMessage: Array<[string, string]>;
  updateSessionStatus: Array<[string, 'clarifying' | 'completed' | 'abandoned']>;
};

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    status: 'clarifying',
    turn_count: 0,
    created_at: new Date('2026-07-29T00:00:00.000Z'),
    updated_at: new Date('2026-07-29T00:00:00.000Z'),
    ...overrides,
  };
}

function buildCalls(): TestCalls {
  return {
    loadOrCreateSession: [],
    transcribeAudio: [],
    insertMessage: [],
    advanceTurn: [],
    buildSessionArtifacts: [],
    getEmbedding: [],
    formatVectorForPg: [],
    findSimilarIdeas: [],
    makeDecision: [],
    saveToLocalVault: [],
    insertIdea: [],
    syncToAppleReminders: [],
    completeSessionWithFinalMessage: [],
    updateSessionStatus: [],
  };
}

function buildDefaultState(): TestState {
  return {
    loadOrCreateSessionResponses: [buildSession(), buildSession()],
    transcribedText: '转写后的语音内容',
    sessionArtifacts: {
      sessionContext: '用户: 我有一个想法',
      rawText: '',
    },
    decision: {
      type: 'clarify',
      message: '你希望这个想法最终产出成什么？',
    },
    similarIdeas: [],
    saveToLocalVaultError: null,
    syncReminderError: null,
  };
}

let state = buildDefaultState();
let calls = buildCalls();

mock.module('../../services/transcription.js', () => ({
  transcribeAudio: async (
    audioBuffer: Buffer,
    options: { fileName?: string; mimeType?: string } = {}
  ): Promise<string> => {
    calls.transcribeAudio.push([audioBuffer, options]);
    return state.transcribedText;
  },
}));

mock.module('../../services/embedding.js', () => ({
  getEmbedding: async (text: string): Promise<number[]> => {
    calls.getEmbedding.push(text);
    return [0.1, 0.2, 0.3];
  },
  formatVectorForPg: (vector: number[]): string => {
    calls.formatVectorForPg.push(vector);
    return `[${vector.join(',')}]`;
  },
}));

mock.module('../../services/session.js', () => ({
  loadOrCreateSession: async (sessionId?: string): Promise<Session> => {
    calls.loadOrCreateSession.push([sessionId]);
    const nextSession = state.loadOrCreateSessionResponses.shift();
    if (!nextSession) {
      throw new Error('No mocked session available');
    }

    return nextSession;
  },
  advanceTurn: async (sessionId: string): Promise<void> => {
    calls.advanceTurn.push(sessionId);
  },
}));

mock.module('../../services/clarification.js', () => ({
  makeDecision: async (
    session: Session,
    sessionContext: string,
    ragContext: string
  ): Promise<LlmDecision> => {
    calls.makeDecision.push([session, sessionContext, ragContext]);
    return state.decision;
  },
  isFinalDecision: (decision: LlmDecision): boolean => decision.type === 'final',
}));

mock.module('../../services/vault.js', () => ({
  saveToLocalVault: async (title: string, markdown: string, rawText: string): Promise<string> => {
    calls.saveToLocalVault.push([title, markdown, rawText]);
    if (state.saveToLocalVaultError) {
      throw state.saveToLocalVaultError;
    }

    return '/tmp/adhd-healing/test.md';
  },
}));

mock.module('../../services/reminders.js', () => ({
  syncToAppleReminders: async (taskTitle: string, description: string): Promise<void> => {
    calls.syncToAppleReminders.push([taskTitle, description]);
    if (state.syncReminderError) {
      throw state.syncReminderError;
    }
  },
}));

mock.module('../../db/queries/sessions.js', () => ({
  completeSessionWithFinalMessage: async (sessionId: string, assistantMessage: string): Promise<void> => {
    calls.completeSessionWithFinalMessage.push([sessionId, assistantMessage]);
  },
  updateSessionStatus: async (
    sessionId: string,
    status: 'clarifying' | 'completed' | 'abandoned'
  ): Promise<void> => {
    calls.updateSessionStatus.push([sessionId, status]);
  },
}));

mock.module('../../db/queries/messages.js', () => ({
  insertMessage: async (
    sessionId: string,
    role: 'user' | 'assistant',
    inputMode: 'audio' | 'text' | 'system',
    content: string
  ): Promise<void> => {
    calls.insertMessage.push([sessionId, role, inputMode, content]);
  },
}));

mock.module('../../db/queries/ideas.js', () => ({
  insertIdea: async (vectorStr: string, rawText: string, distilledText: string): Promise<void> => {
    calls.insertIdea.push([vectorStr, rawText, distilledText]);
  },
  findSimilarIdeas: async (vectorStr: string, limit: number): Promise<IdeaRow[]> => {
    calls.findSimilarIdeas.push([vectorStr, limit]);
    return state.similarIdeas;
  },
}));

mock.module('../../utils/context.js', () => ({
  buildSessionArtifacts: async (sessionId: string): Promise<SessionArtifacts> => {
    calls.buildSessionArtifacts.push(sessionId);
    return state.sessionArtifacts;
  },
}));

const { processDistill } = await import('./process.js');

beforeEach(() => {
  state = buildDefaultState();
  calls = buildCalls();
});

describe('processDistill', () => {
  it('persists user and assistant messages for clarify responses', async () => {
    const request: DistillRequestData = {
      inputMode: 'text',
      text: '我想做一个记录工具',
    };

    const result = await processDistill(request);

    expect(calls.loadOrCreateSession).toEqual([[undefined], ['session-1']]);
    expect(calls.insertMessage).toEqual([
      ['session-1', 'user', 'text', '我想做一个记录工具'],
      ['session-1', 'assistant', 'system', '你希望这个想法最终产出成什么？'],
    ]);
    expect(calls.advanceTurn).toEqual(['session-1']);
    expect(calls.getEmbedding).toEqual(['我想做一个记录工具']);
    expect(calls.completeSessionWithFinalMessage).toEqual([]);
    expect(calls.updateSessionStatus).toEqual([]);
    expect(result).toEqual({
      session_id: 'session-1',
      response_type: 'clarify',
      assistant_message: '你希望这个想法最终产出成什么？',
      turn_index: 1,
      is_complete: false,
      final_markdown: null,
      final_title: null,
      milestone: null,
    });
  });

  it('normalizes final markdown and commits completion without a duplicate assistant insert', async () => {
    state.loadOrCreateSessionResponses = [
      buildSession({ id: 'session-final', turn_count: 2 }),
      buildSession({ id: 'session-final', turn_count: 2 }),
    ];
    state.sessionArtifacts = {
      sessionContext: [
        '用户: 我想做一个本地优先的记录工具，最终产出一个 Bun 服务原型。',
        '用户: 目标用户先是我自己，要求本地优先和隐私安全，这周完成第一版验证。',
      ].join('\n'),
      rawText: '聚合后的原始文本',
    };
    state.decision = {
      type: 'final',
      message: '蒸馏完成',
      markdown: '核心总结',
    };

    const result = await processDistill({
      inputMode: 'text',
      text: '最后一轮补充信息',
      sessionId: 'session-final',
    });

    const expectedMarkdown = [
      '### 🎯 今日灵感内核',
      '核心总结',
      '',
      '### 🔄 历史思维连线 (RAG 检索结果)',
      '无相关历史记录',
      '',
      '### 🚀 20分钟强制里程碑 (Milestone)',
      '明确 20 分钟第一步',
      '- 写下第一个可执行动作',
    ].join('\n');

    expect(calls.insertMessage).toEqual([['session-final', 'user', 'text', '最后一轮补充信息']]);
    expect(calls.getEmbedding).toEqual(['聚合后的原始文本', '聚合后的原始文本']);
    expect(calls.saveToLocalVault).toEqual([['核心总结', expectedMarkdown, '聚合后的原始文本']]);
    expect(calls.insertIdea).toEqual([['[0.1,0.2,0.3]', '聚合后的原始文本', expectedMarkdown]]);
    expect(calls.completeSessionWithFinalMessage).toEqual([['session-final', expectedMarkdown]]);
    expect(calls.updateSessionStatus).toEqual([]);
    expect(calls.syncToAppleReminders).toHaveLength(1);
    expect(calls.syncToAppleReminders[0]?.[0]).toBe('明确 20 分钟第一步');
    expect(calls.syncToAppleReminders[0]?.[1]).toContain(expectedMarkdown);
    expect(result).toEqual({
      session_id: 'session-final',
      response_type: 'final',
      assistant_message: '蒸馏完成',
      turn_index: 2,
      is_complete: true,
      final_markdown: expectedMarkdown,
      final_title: '核心总结',
      milestone: '明确 20 分钟第一步',
    });
  });

  it('marks the session abandoned when finalization fails before completion is committed', async () => {
    state.loadOrCreateSessionResponses = [
      buildSession({ id: 'session-failure', turn_count: 2 }),
      buildSession({ id: 'session-failure', turn_count: 2 }),
    ];
    state.sessionArtifacts = {
      sessionContext: '用户: 我想把这个想法直接收束成结论。',
      rawText: '会触发失败的原始文本',
    };
    state.decision = {
      type: 'final',
      message: '蒸馏完成',
      markdown: '核心总结',
    };
    state.saveToLocalVaultError = new Error('vault write failed');

    await expect(
      processDistill({
        inputMode: 'text',
        text: '最后一轮补充信息',
        sessionId: 'session-failure',
      })
    ).rejects.toThrow('vault write failed');

    expect(calls.insertMessage).toEqual([['session-failure', 'user', 'text', '最后一轮补充信息']]);
    expect(calls.completeSessionWithFinalMessage).toEqual([]);
    expect(calls.insertIdea).toEqual([]);
    expect(calls.syncToAppleReminders).toEqual([]);
    expect(calls.updateSessionStatus).toEqual([['session-failure', 'abandoned']]);
  });
});