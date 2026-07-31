import type { DistillRequest, DistillApiResponse, LlmFinalDecision } from '../../types';
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
  session: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<DistillApiResponse> {
  console.log('[distill] 🏁 AI 决定收工，正在固化资产...');

  await runFinalizeWritePipeline({
    title: decision.title || 'untitled-idea',
    markdown: decision.markdown,
    milestone: decision.milestone,
    rawText: buildRawText(session),
    transcript: buildTranscript(session),
    archive: decision.archive,
  });

  clearSession();
  return { status: 'FINISH', text: decision.markdown };
}

function handleContinue(decision: { message: string }): DistillApiResponse {
  console.log(`[distill] 💬 AI 追问: ${decision.message}`);
  appendToSession('assistant', decision.message);
  return { status: 'CONTINUE', text: decision.message };
}

export async function processDistill(reqData: DistillRequest): Promise<DistillApiResponse> {
  if (reqData.reset) resetSession();

  const session = getSession();
  console.log(`[distill] 📥 User: ${reqData.text}`);
  session.push({ role: 'user', content: reqData.text });

  const decision = await makeDecision(session);

  if (isFinalDecision(decision)) return handleComplete(decision, session);
  return handleContinue(decision);
}
