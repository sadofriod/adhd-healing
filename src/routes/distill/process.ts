import type { DistillRequestData, DistillResponse, LlmDecision, LlmFinalDecision, Session } from '../../types.js';
import { transcribeAudio } from '../../services/transcription.js';
import { getEmbedding, formatVectorForPg } from '../../services/embedding.js';
import { loadOrCreateSession, advanceTurn } from '../../services/session.js';
import { makeDecision, isFinalDecision } from '../../services/clarification.js';
import { saveToLocalVault } from '../../services/vault.js';
import { syncToAppleReminders } from '../../services/reminders.js';
import { updateSessionStatus } from '../../db/queries/sessions.js';
import { insertMessage } from '../../db/queries/messages.js';
import { insertIdea, findSimilarIdeas } from '../../db/queries/ideas.js';
import { buildSessionContext } from '../../utils/context.js';
import { extractTitle, extractMilestone } from '../../utils/markdown.js';

const SIMILAR_IDEAS_LIMIT = 2;
const NO_HISTORY_CONTEXT = '（无相关历史记录）';

async function resolveText(reqData: DistillRequestData): Promise<string> {
  if (reqData.inputMode === 'audio') return transcribeAudio(reqData.audioBuffer);
  return reqData.text;
}

async function persistUserMessage(
  sessionId: string,
  text: string,
  inputMode: string
): Promise<void> {
  await insertMessage(sessionId, 'user', inputMode, text);
  await advanceTurn(sessionId);
}

async function buildRagContext(text: string): Promise<string> {
  const vector = await getEmbedding(text);
  const vectorStr = formatVectorForPg(vector);
  const ideas = await findSimilarIdeas(vectorStr, SIMILAR_IDEAS_LIMIT);
  if (ideas.length === 0) return NO_HISTORY_CONTEXT;
  return ideas.map(i => i.distilled_text).join('\n\n---\n\n');
}

async function saveFinalIdea(sessionId: string, rawText: string, markdown: string): Promise<void> {
  const vector = await getEmbedding(rawText);
  const vectorStr = formatVectorForPg(vector);
  await insertIdea(vectorStr, rawText, markdown);
  await updateSessionStatus(sessionId, 'completed');
  console.log('[session] Completed session:', sessionId);
}

async function handleMilestone(markdown: string): Promise<void> {
  const milestone = extractMilestone(markdown);
  if (!milestone) return;
  try {
    await syncToAppleReminders(milestone);
  } catch (error) {
    console.error('[reminders] Error syncing reminder:', error);
  }
}

async function finalizeSession(
  sessionId: string,
  rawText: string,
  markdown: string
): Promise<void> {
  const title = extractTitle(markdown);
  await saveFinalIdea(sessionId, rawText, markdown);
  await saveToLocalVault(title, markdown, rawText);
  await handleMilestone(markdown);
}

type FinalFields = Pick<DistillResponse, 'final_markdown' | 'final_title' | 'milestone'>;

function buildNullFinalFields(): FinalFields {
  return { final_markdown: null, final_title: null, milestone: null };
}

function buildFinalFields(decision: LlmFinalDecision): FinalFields {
  return {
    final_markdown: decision.markdown,
    final_title: extractTitle(decision.markdown),
    milestone: extractMilestone(decision.markdown),
  };
}

function selectFinalFields(decision: LlmDecision): FinalFields {
  if (isFinalDecision(decision)) return buildFinalFields(decision);
  return buildNullFinalFields();
}

function buildResponse(session: Session, decision: LlmDecision): DistillResponse {
  return {
    session_id: session.id,
    response_type: decision.type,
    assistant_message: decision.message,
    turn_index: session.turn_count,
    is_complete: isFinalDecision(decision),
    ...selectFinalFields(decision),
  };
}

export async function processDistill(reqData: DistillRequestData): Promise<DistillResponse> {
  const session = await loadOrCreateSession(reqData.sessionId);
  const text = await resolveText(reqData);
  await persistUserMessage(session.id, text, reqData.inputMode);
  const sessionContext = await buildSessionContext(session.id);
  const ragContext = await buildRagContext(text);
  const decision = await makeDecision(session, sessionContext, ragContext);
  await insertMessage(session.id, 'assistant', 'system', decision.message);
  if (isFinalDecision(decision)) await finalizeSession(session.id, text, decision.markdown);
  return buildResponse(session, decision);
}
