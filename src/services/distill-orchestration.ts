import type {
  DistillAttachment,
  DistillRequest,
  DistillApiResponse,
  LlmFinalDecision,
  LlmClarifyDecision,
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
};

type ContinueDecision = LlmClarifyDecision | LlmProgressDecision;

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

async function prepareSessionTurn(reqData: DistillRequest): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (reqData.sessionId) {
    const wasBound = await bindSession(reqData.sessionId);
    if (!wasBound) throw new Error(`Session not found: ${reqData.sessionId}`);
  } else {
    clearSession();
  }
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
  makeDecisionFn: typeof makeDecision = makeDecision
): Promise<ReturnType<typeof makeDecision>> {
  return makeDecisionFn(session, locale, reportProgress);
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

async function resolveDistillOutcome(
  decision: ReturnType<typeof makeDecision> extends Promise<infer Result> ? Result : never,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  deps: DistillOrchestrationDeps
): Promise<DistillApiResponse> {
  return isFinalDecision(decision)
    ? finalizeDecision(decision, session, reportProgress, locale, deps)
    : handleContinue(decision, session, reportProgress, locale, deps.persistDistillCheckpoint);
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
  return `AI 阶段进展（${decision.phase}）`;
}

async function handleContinue(
  decision: ContinueDecision,
  session: Array<{ role: 'user' | 'assistant'; content: string }>,
  reportProgress: LlmActivityReporter,
  locale: Locale,
  persistCheckpoint: typeof persistDistillCheckpoint = persistDistillCheckpoint
): Promise<DistillApiResponse> {
  console.log(`[distill] 💬 ${getContinueLogLabel(decision)}: ${decision.message}`);

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

  await appendToSession('assistant', decision.message);
  await flushSessionPersistence();
  return {
    status: 'CONTINUE',
    sessionId: requireCurrentSessionId(),
    text: decision.message,
  };
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
  return resolveDistillOutcome(decision, session, persistedReportProgress, locale, deps);
}