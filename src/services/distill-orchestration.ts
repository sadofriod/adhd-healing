import type {
  DistillAttachment,
  DistillRequest,
  DistillApiResponse,
  LlmFinalDecision,
  LlmClarifyDecision,
  LlmNoteDecision,
  LlmProgressDecision,
  LlmActivityReporter,
} from '../types';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale';
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
  recordSessionActivity,
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
  readonly now?: () => number;
  readonly autoContinueDeadlineMs?: number;
  readonly maxAutoContinueStallCount?: number;
};

type ContinueDecision = LlmClarifyDecision | LlmNoteDecision | LlmProgressDecision;
type AutoContinueDecision = LlmNoteDecision | LlmProgressDecision;
type DistillDecision = Awaited<ReturnType<typeof makeDecision>>;
type NowProvider = () => number;

type AutoContinueGuards = {
  readonly deadlineAt: number;
  readonly deadlineMs: number;
  readonly maxAutoContinueStallCount: number;
  readonly now: NowProvider;
  previousAutoContinueSignature?: string;
  stallCount: number;
};

const DEFAULT_AUTO_CONTINUE_DEADLINE_MS = 60_000;
const DEFAULT_MAX_AUTO_CONTINUE_STALL_COUNT = 3;

class AutoContinueDeadlineExceededError extends Error {
  constructor() {
    super('Auto-continue deadline exceeded');
  }
}

function createPersistedActivityReporter(reportProgress: LlmActivityReporter): LlmActivityReporter {
  return event => {
    recordSessionActivity(event);
    reportProgress(event);
  };
}

function isEnglish(locale: Locale): boolean {
  return locale === 'en';
}

function getRoleLabel(locale: Locale, role: 'user' | 'assistant'): string {
  if (isEnglish(locale)) return role === 'user' ? 'User' : 'Assistant';
  return role === 'user' ? '用户' : '助手';
}

function getAttachmentHeader(locale: Locale): string {
  if (isEnglish(locale)) return '--- Attachment Content ---';
  return '--- 附件内容 ---';
}

function getAttachmentTitle(locale: Locale, index: number, name: string): string {
  if (isEnglish(locale)) return `[Attachment ${index}] ${name}`;
  return `【附件 ${index}】${name}`;
}

function getAttachmentTypeLine(locale: Locale, mimeType: string): string {
  if (isEnglish(locale)) return `Type: ${mimeType}`;
  return `类型: ${mimeType}`;
}

function getAttachmentSizeLine(locale: Locale, size: number): string {
  if (isEnglish(locale)) return `Size: ${size.toLocaleString()} bytes`;
  return `大小: ${size.toLocaleString()} 字节`;
}

function getAttachmentContentLabel(locale: Locale): string {
  if (isEnglish(locale)) return 'Content:';
  return '内容:';
}

function getRequestLogLabel(resume: boolean | undefined): string {
  return resume ? '▶️ Resume' : '📥 User';
}

function getResumedProgressMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'Paused task resumed. Continuing execution.';
  return '已恢复暂停任务，继续执行';
}

function getStartedProgressMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'Started processing current user input.';
  return '已开始处理本轮输入';
}

function getCheckpointWriteFailureMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'Failed to persist checkpoint. Returning current result instead.';
  return '阶段性结论写入失败，已继续返回当前结果';
}

function getFinalizeProgressMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'Final output persisted. Closing current session.';
  return '最终产物已固化，正在结束当前会话';
}

function getFinalizeToolCallMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'Persisting Obsidian artifacts via MCP and creating reminders';
  return '正在通过 MCP 固化 Obsidian 资产并创建提醒';
}

function getFinalSummaryLines(
  locale: Locale,
  artifactMainLink: string,
  artifactDirectoryPath: string,
  researchCount: number,
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
): readonly string[] {
  if (isEnglish(locale)) {
    return [
      '🎉 Distillation complete!',
      '',
      `Archived to Obsidian via MCP: ${artifactMainLink}`,
      `Output directory: ${artifactDirectoryPath}`,
      `Deep research reports: ${researchCount}`,
      'Minimal execution task sent to Reminders.',
      '',
      `Total usage: input ${tokenUsage.inputTokens} / output ${tokenUsage.outputTokens} / total ${tokenUsage.totalTokens} tokens`,
    ];
  }
  return [
    '🎉 澄清完成！',
    '',
    `已通过 MCP 归档至 Obsidian: ${artifactMainLink}`,
    `产物目录: ${artifactDirectoryPath}`,
    `深度调研报告: ${researchCount} 份`,
    '已下发极简任务到 Reminders。',
    '',
    `本轮总消耗: input ${tokenUsage.inputTokens} / output ${tokenUsage.outputTokens} / total ${tokenUsage.totalTokens} tokens`,
  ];
}

function reportProcessProgress(
  reportProgress: LlmActivityReporter,
  message: string,
  details?: string
): void {
  reportProgress({
    type: 'progress',
    phase: 'process',
    message,
    ...(details ? { details } : {}),
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isFinalDecision(decision: { type: string }): decision is LlmFinalDecision {
  return decision.type === 'final';
}

async function resolveResearchArtifacts(
  decision: LlmFinalDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  runResearch: typeof runDeepResearch = runDeepResearch
): Promise<LlmFinalDecision['researchArtifacts']> {
  if (decision.researchTopics.length === 0) return decision.researchArtifacts;
  return runResearch({
    topics: decision.researchTopics,
    mainTitle: decision.title,
    mainMarkdown: decision.markdown,
    sessionMessages: session,
    locale,
  }, undefined, reportProgress);
}

async function bindRequestSessionContext(reqData: DistillRequest): Promise<void> {
  if (!reqData.sessionId) {
    clearSession();
    return;
  }

  const wasBound = await bindSession(reqData.sessionId);
  if (!wasBound) throw new Error(`Session not found: ${reqData.sessionId}`);
}

async function prepareSessionTurn(reqData: DistillRequest): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  await bindRequestSessionContext(reqData);
  if (reqData.reset) await resetSession();
  const locale = reqData.locale ?? DEFAULT_LOCALE;
  const attachments = reqData.attachments ?? [];
  const content = buildUserTurnContent(reqData.text, attachments, locale);
  console.log(`[distill] ${getRequestLogLabel(reqData.resume)}: ${reqData.text}`);
  return prepareUserTurn(content, reqData.resume === true, {
    text: reqData.text,
    attachments,
  });
}

function requireCurrentSessionId(): string {
  const sessionId = getCurrentSessionId();
  if (!sessionId) throw new Error('Session was not initialized');
  return sessionId;
}

function buildUserTurnContent(
  text: string,
  attachments: readonly DistillAttachment[],
  locale: Locale
): string {
  if (attachments.length === 0) return text;

  const attachmentBlocks = attachments.map((attachment, index) => [
    getAttachmentTitle(locale, index + 1, attachment.name),
    attachment.mimeType ? getAttachmentTypeLine(locale, attachment.mimeType) : null,
    getAttachmentSizeLine(locale, attachment.size),
    getAttachmentContentLabel(locale),
    attachment.content,
  ].filter((line): line is string => line !== null).join('\n'));

  return [text, getAttachmentHeader(locale), ...attachmentBlocks].join('\n\n');
}

async function resolveDecision(
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  makeDecisionFn: typeof makeDecision = makeDecision,
  progress?: LlmProgressDecision
): Promise<ReturnType<typeof makeDecision>> {
  return makeDecisionFn(session, locale, reportProgress, progress);
}

async function finalizeDecision(
  decision: LlmFinalDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  deps: DistillOrchestrationDeps
): Promise<DistillApiResponse> {
  const researchArtifacts = await resolveResearchArtifacts(
    decision,
    session,
    reportProgress,
    locale,
    deps.runDeepResearch ?? runDeepResearch
  );

  return handleComplete({
    ...decision,
    researchArtifacts,
  }, session, reportProgress, locale, deps.runFinalizeWritePipeline);
}

function buildTranscript(
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  locale: Locale
): string {
  return session
    .map(message => `${getRoleLabel(locale, message.role)}: ${message.content}`)
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
  locale: Locale,
  finalizeWritePipeline: typeof runFinalizeWritePipeline = runFinalizeWritePipeline
): Promise<DistillApiResponse> {
  console.log('[distill] 🏁 AI 决定收工，正在固化资产...');
  const sessionId = requireCurrentSessionId();
  const tokenUsage = getSessionTokenUsage();
  reportProgress({
    type: 'progress',
    phase: 'tool-call',
    message: getFinalizeToolCallMessage(locale),
  });

  const artifactBundle = await finalizeWritePipeline({
    sessionId,
    title: decision.title || 'untitled-idea',
    markdown: decision.markdown,
    milestone: decision.milestone,
    rawText: buildRawText(session),
    transcript: buildTranscript(session, locale),
    archive: decision.archive,
    researchArtifacts: decision.researchArtifacts,
    tokenUsage,
  });

  reportProcessProgress(reportProgress, getFinalizeProgressMessage(locale));

  await appendToSession('assistant', decision.message);
  await markSessionFinished();
  return {
    status: 'FINISH',
    sessionId,
    text: getFinalSummaryLines(
      locale,
      artifactBundle.mainLink,
      artifactBundle.directoryPath,
      decision.researchArtifacts.length,
      tokenUsage
    ).join('\n'),
    tokenUsage,
  };
}

function getContinueLogLabel(decision: ContinueDecision): string {
  if (decision.type === 'clarify') return 'AI 追问';
  if (decision.type === 'note') return 'AI 阶段陈述';
  return `AI 阶段进展（${decision.phase}）`;
}

function getAutoContinueMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'Continuing automatically based on the current statement.';
  return '基于当前阶段陈述继续自动执行';
}

function getSystemPauseMessage(locale: Locale): string {
  if (isEnglish(locale)) return 'System safeguard triggered. Task has been paused.';
  return '触发系统保护，任务已暂停';
}

function getDeadlineExceededDetails(locale: Locale, deadlineMs: number): string {
  if (isEnglish(locale)) {
    return `Automatic continuation exceeded the internal deadline of ${deadlineMs}ms.`;
  }
  return `自动续跑超过内部时限 ${deadlineMs}ms。`;
}

function getAutoContinueStalledDetails(locale: Locale, stallCount: number): string {
  if (isEnglish(locale)) {
    return `Automatic continuation repeated the same intermediate decision ${stallCount} times.`;
  }
  return `自动续跑连续 ${stallCount} 次重复相同的中间决策。`;
}

function isClarifyDecision(decision: DistillDecision): decision is LlmClarifyDecision {
  return decision.type === 'clarify';
}

function isAutoContinueDecision(decision: DistillDecision): decision is AutoContinueDecision {
  return decision.type === 'note' || decision.type === 'progress';
}

function toProgressContext(decision: AutoContinueDecision): LlmProgressDecision {
  if (decision.type === 'progress') return decision;
  return {
    type: 'progress',
    phase: 'process',
    message: decision.message,
  };
}

function reportAutoContinueProgress(
  reportProgress: LlmActivityReporter,
  decision: AutoContinueDecision,
  locale: Locale
): void {
  if (decision.type === 'progress') {
    reportProgress(decision);
    return;
  }

  reportProgress({
    type: 'progress',
    phase: 'process',
    message: getAutoContinueMessage(locale),
    details: decision.message,
  });
}

function buildAutoContinueSignature(decision: AutoContinueDecision): string {
  if (decision.type === 'note') return `note:${decision.message}`;
  return [
    'progress',
    decision.phase,
    decision.message,
    decision.details ?? '',
    decision.operationId ?? '',
  ].join(':');
}

function getRemainingDeadlineMs(deadlineAt: number, now: () => number): number {
  return deadlineAt - now();
}

async function resolveDecisionWithinDeadline(
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  makeDecisionFn: typeof makeDecision,
  deadlineAt: number,
  now: () => number,
  progress?: LlmProgressDecision
): Promise<DistillDecision> {
  const remainingMs = getRemainingDeadlineMs(deadlineAt, now);
  if (remainingMs <= 0) throw new AutoContinueDeadlineExceededError();

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new AutoContinueDeadlineExceededError()), remainingMs);
  });

  try {
    return await Promise.race([
      resolveDecision(session, reportProgress, locale, makeDecisionFn, progress),
      timeoutResult,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function persistCheckpointSafely(
  decision: ContinueDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  persistCheckpoint: typeof persistDistillCheckpoint = persistDistillCheckpoint
): Promise<void> {
  try {
    await persistCheckpoint({ decision, session });
  } catch (error) {
    console.error('[distill] 写入阶段性结论失败，继续返回当前结论：', error);
    reportProcessProgress(
      reportProgress,
      getCheckpointWriteFailureMessage(locale),
      getErrorMessage(error)
    );
  }
}

async function handleContinue(
  decision: LlmClarifyDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  persistCheckpoint: typeof persistDistillCheckpoint = persistDistillCheckpoint
): Promise<DistillApiResponse> {
  console.log(`[distill] 💬 ${getContinueLogLabel(decision)}: ${decision.message}`);
  await persistCheckpointSafely(decision, session, reportProgress, locale, persistCheckpoint);

  await appendToSession('assistant', decision.message);
  await flushSessionPersistence();
  return {
    status: 'CONTINUE',
    sessionId: requireCurrentSessionId(),
    text: decision.message,
  };
}

async function handleSystemPause(
  message: string,
  details: string,
  reportProgress: LlmActivityReporter
): Promise<DistillApiResponse> {
  reportProcessProgress(reportProgress, message, details);
  await flushSessionPersistence();
  return {
    status: 'PAUSED',
    sessionId: requireCurrentSessionId(),
    text: details,
  };
}

function createAutoContinueGuards(deps: DistillOrchestrationDeps): AutoContinueGuards {
  const now = deps.now ?? Date.now;
  const deadlineMs = deps.autoContinueDeadlineMs ?? DEFAULT_AUTO_CONTINUE_DEADLINE_MS;
  return {
    deadlineAt: now() + deadlineMs,
    deadlineMs,
    maxAutoContinueStallCount: deps.maxAutoContinueStallCount ?? DEFAULT_MAX_AUTO_CONTINUE_STALL_COUNT,
    now,
    previousAutoContinueSignature: undefined,
    stallCount: 0,
  };
}

async function resolveTerminalDecision(
  decision: DistillDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  deps: DistillOrchestrationDeps,
  guards: AutoContinueGuards
): Promise<DistillApiResponse | null> {
  if (isFinalDecision(decision)) {
    return finalizeDecision(decision, session, reportProgress, locale, deps);
  }

  if (isClarifyDecision(decision)) {
    return handleContinue(decision, session, reportProgress, locale, deps.persistDistillCheckpoint);
  }

  const decisionSignature = buildAutoContinueSignature(decision);
  guards.stallCount = decisionSignature === guards.previousAutoContinueSignature ? guards.stallCount + 1 : 1;
  guards.previousAutoContinueSignature = decisionSignature;
  if (guards.stallCount < guards.maxAutoContinueStallCount) return null;

  return handleSystemPause(
    getSystemPauseMessage(locale),
    getAutoContinueStalledDetails(locale, guards.stallCount),
    reportProgress
  );
}

async function advanceAutoContinueDecision(
  decision: AutoContinueDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  deps: DistillOrchestrationDeps,
  decide: typeof makeDecision,
  guards: AutoContinueGuards
): Promise<DistillDecision | DistillApiResponse> {
  console.log(`[distill] 💬 ${getContinueLogLabel(decision)}: ${decision.message}`);
  reportAutoContinueProgress(reportProgress, decision, locale);
  await persistCheckpointSafely(decision, session, reportProgress, locale, deps.persistDistillCheckpoint);

  try {
    return await resolveDecisionWithinDeadline(
      session,
      reportProgress,
      locale,
      decide,
      guards.deadlineAt,
      guards.now,
      toProgressContext(decision)
    );
  } catch (error) {
    if (!(error instanceof AutoContinueDeadlineExceededError)) throw error;
    return handleSystemPause(
      getSystemPauseMessage(locale),
      getDeadlineExceededDetails(locale, guards.deadlineMs),
      reportProgress
    );
  }
}

async function resolveNextLoopStep(
  decision: DistillDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  deps: DistillOrchestrationDeps,
  decide: typeof makeDecision,
  guards: AutoContinueGuards
): Promise<DistillDecision | DistillApiResponse> {
  const terminalResponse = await resolveTerminalDecision(decision, session, reportProgress, locale, deps, guards);
  if (terminalResponse) return terminalResponse;
  if (!isAutoContinueDecision(decision)) throw new Error(`Unsupported decision type: ${decision.type}`);
  return advanceAutoContinueDecision(decision, session, reportProgress, locale, deps, decide, guards);
}

async function resolveDistillDecisionLoop(
  initialDecision: DistillDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  deps: DistillOrchestrationDeps
): Promise<DistillApiResponse> {
  const decide = deps.makeDecision ?? makeDecision;
  const guards = createAutoContinueGuards(deps);
  let decision = initialDecision;

  for (;;) {
    const nextStep = await resolveNextLoopStep(decision, session, reportProgress, locale, deps, decide, guards);
    if ('status' in nextStep) return nextStep;
    decision = nextStep;
  }
}

export async function runDistillOrchestration(
  reqData: DistillRequest,
  reportProgress: LlmActivityReporter,
  deps: DistillOrchestrationDeps = {}
): Promise<DistillApiResponse> {
  const locale = reqData.locale ?? DEFAULT_LOCALE;
  const session = await prepareSessionTurn(reqData);
  const persistedReportProgress = createPersistedActivityReporter(reportProgress);
  reportProcessProgress(
    persistedReportProgress,
    reqData.resume === true ? getResumedProgressMessage(locale) : getStartedProgressMessage(locale)
  );
  const decision = await resolveDecision(
    session,
    persistedReportProgress,
    locale,
    deps.makeDecision ?? makeDecision
  );
  return resolveDistillDecisionLoop(decision, session, persistedReportProgress, locale, deps);
}