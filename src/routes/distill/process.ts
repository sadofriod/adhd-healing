import type {
  DistillRequest,
  DistillApiResponse,
  LlmFinalDecision,
  LlmProgressReporter,
} from '../../types';
import {
  getSession,
  resetSession,
  appendToSession,
  clearSession,
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
  reportProgress: LlmProgressReporter
): Promise<DistillApiResponse> {
  console.log('[distill] 🏁 AI 决定收工，正在固化资产...');
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
  });

  clearSession();
  return {
    status: 'FINISH',
    text: [
      '🎉 澄清完成！',
      '',
      `已通过 MCP 归档至 Obsidian: ${artifactBundle.mainLink}`,
      `产物目录: ${artifactBundle.directoryPath}`,
      `深度调研报告: ${decision.researchArtifacts.length} 份`,
      '已下发极简任务到 Reminders。',
    ].join('\n'),
  };
}

function handleContinue(decision: { message: string }): DistillApiResponse {
  console.log(`[distill] 💬 AI 追问: ${decision.message}`);
  appendToSession('assistant', decision.message);
  return { status: 'CONTINUE', text: decision.message };
}

export async function processDistill(
  reqData: DistillRequest,
  reportProgress: LlmProgressReporter
): Promise<DistillApiResponse> {
  if (reqData.reset) resetSession();

  const session = getSession();
  console.log(`[distill] 📥 User: ${reqData.text}`);
  session.push({ role: 'user', content: reqData.text });

  const decision = await makeDecision(session, reportProgress);

  if (isFinalDecision(decision)) return handleComplete(decision, session, reportProgress);
  return handleContinue(decision);
}
