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
  buildRagReference,
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

  return ideas
    .map((idea, index) => [`[历史参考 ${index + 1}]`, buildRagReference(idea.distilled_text)].join('\n'))
    .join('\n\n');
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
type WorkflowFields = Pick<
  DistillResponse,
  'status' | 'message' | 'next_question' | 'markdown_report' | 'milestone_title' | 'idea_title'
>;

type ResponseDetails = FinalFields & WorkflowFields;

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

function buildClarifyWorkflowFields(decision: Exclude<LlmDecision, LlmFinalDecision>): WorkflowFields {
  return {
    status: 'CONTINUE',
    message: decision.message,
    next_question: decision.message,
    markdown_report: null,
    milestone_title: null,
    idea_title: null,
  };
}

function buildFinalWorkflowFields(
  finalFields: FinalFields,
  decision: LlmFinalDecision
): WorkflowFields {
  return {
    status: 'FINISH',
    message: decision.markdown,
    next_question: null,
    markdown_report: decision.markdown,
    milestone_title: finalFields.milestone,
    idea_title: finalFields.final_title,
  };
}

function buildResponseDetails(decision: LlmDecision): ResponseDetails {
  if (!isFinalDecision(decision)) {
    return {
      ...buildNullFinalFields(),
      ...buildClarifyWorkflowFields(decision),
    };
  }

  const finalFields = buildFinalFields(decision);
  return {
    ...finalFields,
    ...buildFinalWorkflowFields(finalFields, decision),
  };
}

function normalizeDecision(decision: LlmDecision, ragContext: string): LlmDecision {
  if (!isFinalDecision(decision)) return decision;

  return {
    ...decision,
    markdown: normalizeFinalMarkdown(decision.markdown, ragContext),
  };
}

function buildResponse(session: Session, decision: LlmDecision): DistillResponse {
  const responseDetails = buildResponseDetails(decision);

  return {
    session_id: session.id,
    ...responseDetails,
    response_type: decision.type,
    assistant_message: decision.message,
    turn_index: getResponseTurnIndex(session.turn_count, decision),
    is_complete: isFinalDecision(decision),
  };
}

async function persistDecisionOutcome(
  sessionId: string,
  rawText: string,
  decision: LlmDecision
): Promise<void> {
  if (!isFinalDecision(decision)) {
    await persistClarifyDecision(sessionId, decision);
    return;
  }

  try {
    await finalizeSession(sessionId, rawText, decision.markdown);
  } catch (error) {
    return abandonSessionAfterFailure(sessionId, error);
  }
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

  await persistDecisionOutcome(session.id, rawText, decision);

  return buildResponse(updatedSession, decision);
}
