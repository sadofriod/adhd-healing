import type { DistillRequest, DistillApiResponse, LlmFinalDecision } from '../../types.js';
import {
  getSession,
  resetSession,
  appendToSession,
  clearSession,
} from '../../services/session.js';
import { makeDecision } from '../../services/clarification.js';
import { runFinalizeWritePipeline } from './finalize.js';

function isFinalDecision(decision: { type: string }): decision is LlmFinalDecision {
  return decision.type === 'final';
}

async function handleComplete(decision: LlmFinalDecision): Promise<DistillApiResponse> {
  console.log('[distill] 🏁 AI 决定收工，正在固化资产...');

  await runFinalizeWritePipeline({
    title: decision.title || 'untitled-idea',
    markdown: decision.markdown,
    milestone: decision.milestone,
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

  if (isFinalDecision(decision)) return handleComplete(decision);
  return handleContinue(decision);
}
