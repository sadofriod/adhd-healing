import type {
  DistillRequest,
  DistillApiResponse,
  LlmFinalDecision,
  LlmActivityReporter,
  LlmActivityEvent,
} from '../../types';
import {
  resetSession,
  appendToSession,
  addSessionTokenUsage,
  flushSessionPersistence,
  getSessionTokenUsage,
  markSessionFinished,
  prepareUserTurn,
} from '../../services/session';
import { makeDecision } from '../../services/clarification';
import { runFinalizeWritePipeline } from './finalize';

function isFinalDecision(decision: { type: string }): decision is LlmFinalDecision {
  return decision.type === 'final';
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
  reportProgress: LlmActivityReporter
): Promise<DistillApiResponse> {
  console.log('[distill] 🏁 AI 决定收工，正在固化资产...');
  const tokenUsage = getSessionTokenUsage();
  reportProgress({
    type: 'progress',
    phase: 'tool-call',
    message: '正在通过 MCP 固化 Obsidian 资产并创建提醒',
  });

  const artifactBundle = await runFinalizeWritePipeline({
    title: decision.title || 'untitled-idea',
    markdown: decision.markdown,
    milestone: decision.milestone,
    rawText: buildRawText(session),
    transcript: buildTranscript(session),
    archive: decision.archive,
    researchArtifacts: decision.researchArtifacts,
    tokenUsage,
  });

  await markSessionFinished();
  return {
    status: 'FINISH',
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

async function handleContinue(decision: { message: string }): Promise<DistillApiResponse> {
  console.log(`[distill] 💬 AI 追问: ${decision.message}`);
  await appendToSession('assistant', decision.message);
  await flushSessionPersistence();
  return { status: 'CONTINUE', text: decision.message };
}

function formatLogValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatOperationLog(event: Extract<LlmActivityEvent, { type: 'progress' }>): string {
  if (!event.operationId) return '';
  return [
    `\nCall ID: ${event.operationId}`,
    `Input:\n${formatLogValue(event.input)}`,
    ...(event.output === undefined ? [] : [`Output:\n${formatLogValue(event.output)}`]),
  ].join('\n');
}

function logProgress(event: LlmActivityEvent): void {
  if (event.type !== 'progress') return;
  console.log(
    `[clarification] Progress (${event.phase}): ${event.message}`
    + (event.details ? `\n${event.details}` : '')
    + formatOperationLog(event)
  );
}

function getRequestLogLabel(resume: boolean | undefined): string {
  return resume ? '▶️ Resume' : '📥 User';
}

export async function processDistill(
  reqData: DistillRequest,
  reportProgress: LlmActivityReporter
): Promise<DistillApiResponse> {
  if (reqData.reset) await resetSession();

  console.log(`[distill] ${getRequestLogLabel(reqData.resume)}: ${reqData.text}`);
  const session = await prepareUserTurn(reqData.text, reqData.resume === true);

  const reportActivity = (event: LlmActivityEvent): void => {
    if (event.type === 'usage') addSessionTokenUsage(event.usage);
    logProgress(event);
    reportProgress(event);
  };
  const decision = await makeDecision(session, reportActivity);

  if (isFinalDecision(decision)) return handleComplete(decision, session, reportProgress);
  return handleContinue(decision);
}
