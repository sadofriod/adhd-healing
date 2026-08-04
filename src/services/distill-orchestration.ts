import type {
  DistillRequest,
  DistillApiResponse,
  LlmFinalDecision,
  LlmClarifyDecision,
  LlmProgressDecision,
  LlmActivityReporter,
} from '../types';
import {
  bindSession,
  clearSession,
  resetSession,
  appendToSession,
  flushSessionPersistence,
  getCurrentSessionId,
  getSessionTokenUsage,
  markSessionFinished,
  prepareUserTurn,
} from './session';
import { makeDecision } from './clarification';
import { runDeepResearch } from './clarification/research';
import { runFinalizeWritePipeline } from '../routes/distill/finalize';
import { persistDistillCheckpoint } from '../routes/distill/checkpoint';

export type DistillOrchestrationDeps = {
  readonly makeDecision?: typeof makeDecision;
  readonly runDeepResearch?: typeof runDeepResearch;
  readonly runFinalizeWritePipeline?: typeof runFinalizeWritePipeline;
  readonly persistDistillCheckpoint?: typeof persistDistillCheckpoint;
};

type ContinueDecision = LlmClarifyDecision | LlmProgressDecision;

function isFinalDecision(decision: { type: string }): decision is LlmFinalDecision {
  return decision.type === 'final';
}

async function resolveResearchArtifacts(
  decision: LlmFinalDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  runResearch: typeof runDeepResearch = runDeepResearch
): Promise<LlmFinalDecision['researchArtifacts']> {
  if (decision.researchTopics.length === 0) return decision.researchArtifacts;
  return runResearch({
    topics: decision.researchTopics,
    mainTitle: decision.title,
    mainMarkdown: decision.markdown,
    sessionMessages: session,
  }, undefined, reportProgress);
}

async function prepareSessionTurn(reqData: DistillRequest): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (reqData.sessionId) {
    const wasBound = await bindSession(reqData.sessionId);
    if (!wasBound) throw new Error(`Session not found: ${reqData.sessionId}`);
  } else {
    clearSession();
  }
  if (reqData.reset) await resetSession();
  const content = buildUserTurnContent(reqData.text, reqData.attachments ?? []);
  console.log(`[distill] ${getRequestLogLabel(reqData.resume)}: ${reqData.text}`);
  return prepareUserTurn(content, reqData.resume === true);
}

function requireCurrentSessionId(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error('Session was not initialized');
  return sessionId;
}

function buildUserTurnContent(
  text: string,
  attachments: readonly { readonly name: string; readonly content: string; readonly mimeType?: string; readonly size: number }[]
): string {
  if (attachments.length === 0) return text;

  const attachmentBlocks = attachments.map((attachment, index) => [
    `【附件 ${index + 1}】${attachment.name}`,
    attachment.mimeType ? `类型: ${attachment.mimeType}` : null,
    `大小: ${attachment.size.toLocaleString()} 字节`,
    '内容:',
    attachment.content,
  ].filter((line): line is string => line !== null).join('\n'));

  return [text, '--- 附件内容 ---', ...attachmentBlocks].join('\n\n');
}

async function resolveDecision(
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  makeDecisionFn: typeof makeDecision = makeDecision
): Promise<ReturnType<typeof makeDecision>> {
  return makeDecisionFn(session, reportProgress);
}

async function finalizeDecision(
  decision: LlmFinalDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  deps: DistillOrchestrationDeps
): Promise<DistillApiResponse> {
  const researchArtifacts = await resolveResearchArtifacts(
    decision,
    session,
    reportProgress,
    deps.runDeepResearch ?? runDeepResearch
  );

  return handleComplete({
    ...decision,
    researchArtifacts,
  }, session, reportProgress, deps.runFinalizeWritePipeline);
}

async function resolveDistillOutcome(
  decision: ReturnType<typeof makeDecision> extends Promise<infer Result> ? Result : never,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  deps: DistillOrchestrationDeps
): Promise<DistillApiResponse> {
  return isFinalDecision(decision)
    ? finalizeDecision(decision, session, reportProgress, deps)
    : handleContinue(decision, session, deps.persistDistillCheckpoint);
}

function buildTranscript(session: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  return session
    .map(message => `${message.role === 'user' ? '用户' : '助手'}: ${message.content}`)
    .join('\n\n');
}

function buildRawText(session: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  return session
    .filter(message => message.role === 'user')
    .map(message => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
}

async function handleComplete(
  decision: LlmFinalDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  finalizeWritePipeline: typeof runFinalizeWritePipeline = runFinalizeWritePipeline
): Promise<DistillApiResponse> {
  console.log('[distill] 🏁 AI 决定收工，正在固化资产...');
  const sessionId = requireCurrentSessionId();
  const tokenUsage = getSessionTokenUsage();
  reportProgress({
    type: 'progress',
    phase: 'tool-call',
    message: '正在通过 MCP 固化 Obsidian 资产并创建提醒',
  });

  const artifactBundle = await finalizeWritePipeline({
    sessionId,
    title: decision.title || 'untitled-idea',
    markdown: decision.markdown,
    milestone: decision.milestone,
    rawText: buildRawText(session),
    transcript: buildTranscript(session),
    archive: decision.archive,
    researchArtifacts: decision.researchArtifacts,
    tokenUsage,
  });

  await appendToSession('assistant', decision.message);
  await markSessionFinished();
  return {
    status: 'FINISH',
    sessionId,
    text: [
      '🎉 澄清完成！',
      '',
      `已通过 MCP 归档至 Obsidian: ${artifactBundle.mainLink}`,
      `产物目录: ${artifactBundle.directoryPath}`,
      `深度调研报告: ${decision.researchArtifacts.length} 份`,
      '已下发极简任务到 Reminders。',
      '',
      `本轮总消耗: input ${tokenUsage.inputTokens} / output ${tokenUsage.outputTokens} / total ${tokenUsage.totalTokens} tokens`,
    ].join('\n'),
    tokenUsage,
  };
}

function getContinueLogLabel(decision: ContinueDecision): string {
  if (decision.type === 'clarify') return 'AI 追问';
  return `AI 阶段进展（${decision.phase}）`;
}

async function handleContinue(
  decision: ContinueDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  persistCheckpoint: typeof persistDistillCheckpoint = persistDistillCheckpoint
): Promise<DistillApiResponse> {
  console.log(`[distill] 💬 ${getContinueLogLabel(decision)}: ${decision.message}`);

  try {
    await persistCheckpoint({ decision, session });
  } catch (error) {
    console.error('[distill] 写入阶段性结论失败，继续返回当前结论：', error);
  }

  await appendToSession('assistant', decision.message);
  await flushSessionPersistence();
  return {
    status: 'CONTINUE',
    sessionId: requireCurrentSessionId(),
    text: decision.message,
  };
}

function getRequestLogLabel(resume: boolean | undefined): string {
  return resume ? '▶️ Resume' : '📥 User';
}

export async function runDistillOrchestration(
  reqData: DistillRequest,
  reportProgress: LlmActivityReporter,
  deps: DistillOrchestrationDeps = {}
): Promise<DistillApiResponse> {
  const session = await prepareSessionTurn(reqData);
  const decision = await resolveDecision(session, reportProgress, deps.makeDecision ?? makeDecision);
  return resolveDistillOutcome(decision, session, reportProgress, deps);
}