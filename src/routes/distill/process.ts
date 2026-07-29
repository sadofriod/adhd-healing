import type { DistillRequestData, DistillResponse, LlmDecision, LlmFinalDecision, Session } from '../../types.js';
import { transcribeAudio } from '../../services/transcription.js';
import { getEmbedding, formatVectorForPg } from '../../services/embedding.js';
import { loadOrCreateSession, advanceTurn } from '../../services/session.js';
import { makeDecision, isFinalDecision } from '../../services/clarification.js';
import { saveToLocalVault } from '../../services/vault.js';
import { syncToAppleReminders } from '../../services/reminders.js';
import {
  completeSessionWithFinalMessage,
  updateSessionStatus,
} from '../../db/queries/sessions.js';
import { insertMessage } from '../../db/queries/messages.js';
import { insertIdea, findSimilarIdeas } from '../../db/queries/ideas.js';
import { buildSessionArtifacts } from '../../utils/context.js';
import {
  buildReminderDescription,
  extractTitle,
  extractMilestone,
  normalizeFinalMarkdown,
} from '../../utils/markdown.js';
import {
  getAssistantRecordContent,
  getResponseTurnIndex,
  runFinalizeWritePipeline,
} from './finalize.js';

const SIMILAR_IDEAS_LIMIT = 2;
const NO_HISTORY_CONTEXT = '无相关历史记录';

async function resolveText(reqData: DistillRequestData): Promise<string> {
  if (reqData.inputMode === 'audio') {
    return transcribeAudio(reqData.audioBuffer, {
      fileName: reqData.audioFileName,
      mimeType: reqData.audioMimeType,
    });
  }
  return reqData.text;
}

async function persistUserMessage(
  sessionId: string,
  text: string,
  inputMode: DistillRequestData['inputMode']
): Promise<void> {
  await insertMessage(sessionId, 'user', inputMode, text);
}

async function buildRagContext(text: string): Promise<string> {
  const vector = await getEmbedding(text);
  const vectorStr = formatVectorForPg(vector);
  const ideas = await findSimilarIdeas(vectorStr, SIMILAR_IDEAS_LIMIT);
  if (ideas.length === 0) return NO_HISTORY_CONTEXT;
  return ideas.map(i => i.distilled_text).join('\n\n---\n\n');
}

async function saveFinalIdea(rawText: string, markdown: string): Promise<void> {
  const vector = await getEmbedding(rawText);
  const vectorStr = formatVectorForPg(vector);
  await insertIdea(vectorStr, rawText, markdown);
}

async function commitSessionCompletion(sessionId: string, markdown: string): Promise<void> {
  await completeSessionWithFinalMessage(sessionId, markdown);
  console.log('[session] Completed session:', sessionId);
}

async function abandonSessionAfterFailure(sessionId: string, error: unknown): Promise<never> {
  try {
    await updateSessionStatus(sessionId, 'abandoned');
    console.error('[session] Abandoned session after finalize failure:', sessionId);
  } catch (statusError) {
    console.error('[session] Failed to abandon session after finalize failure:', statusError);
  }

  throw error;
}

async function handleMilestone(markdown: string): Promise<void> {
  const milestone = extractMilestone(markdown);
  if (!milestone) return;
  const description = buildReminderDescription(markdown);
  try {
    await syncToAppleReminders(milestone, description);
  } catch (error) {
    console.error('[reminders] Error syncing reminder:', error);
  }
}

export async function finalizeSession(
  sessionId: string,
  rawText: string,
  markdown: string
): Promise<void> {
  const title = extractTitle(markdown);
  await runFinalizeWritePipeline({
    writeToVault: async () => {
      await saveToLocalVault(title, markdown, rawText);
    },
    writeIdeaRecord: () => saveFinalIdea(rawText, markdown),
    syncReminder: () => handleMilestone(markdown),
    commitSessionCompletion: () => commitSessionCompletion(sessionId, markdown),
  });
}

async function persistClarifyDecision(sessionId: string, decision: LlmDecision): Promise<void> {
  if (isFinalDecision(decision)) return;

  await insertMessage(sessionId, 'assistant', 'system', getAssistantRecordContent(decision));
  await advanceTurn(sessionId);
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

function normalizeDecision(decision: LlmDecision, ragContext: string): LlmDecision {
  if (!isFinalDecision(decision)) return decision;

  return {
    ...decision,
    markdown: normalizeFinalMarkdown(decision.markdown, ragContext),
  };
}

function buildResponse(session: Session, decision: LlmDecision): DistillResponse {
  return {
    session_id: session.id,
    response_type: decision.type,
    assistant_message: decision.message,
    turn_index: getResponseTurnIndex(session.turn_count, decision),
    is_complete: isFinalDecision(decision),
    ...selectFinalFields(decision),
  };
}

export async function processDistill(reqData: DistillRequestData): Promise<DistillResponse> {
  const session = await loadOrCreateSession(reqData.sessionId);
  const text = await resolveText(reqData);
  await persistUserMessage(session.id, text, reqData.inputMode);
  const updatedSession = await loadOrCreateSession(session.id);
  const sessionArtifacts = await buildSessionArtifacts(session.id);
  const rawText = sessionArtifacts.rawText || text;
  const ragContext = await buildRagContext(rawText);
  const decision = normalizeDecision(
    await makeDecision(updatedSession, sessionArtifacts.sessionContext, ragContext),
    ragContext
  );

  if (isFinalDecision(decision)) {
    try {
      await finalizeSession(session.id, rawText, decision.markdown);
    } catch (error) {
      return abandonSessionAfterFailure(session.id, error);
    }
  } else {
    await persistClarifyDecision(session.id, decision);
  }

  return buildResponse(updatedSession, decision);
}
