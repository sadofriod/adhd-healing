import { config } from '../config/env.js';
import { getLlmClient } from './llm-client.js';
import { checkTranscriptionSupport } from './transcription.js';

function collectAvailableModels(modelIds: string[]): string {
  if (modelIds.length === 0) return 'none';
  return modelIds.join(', ');
}

function assertModelLoaded(
  loadedModelIds: Set<string>,
  modelName: string,
  modelLabel: 'chat' | 'embedding'
): void {
  if (loadedModelIds.has(modelName)) return;

  throw new Error(
    `LM Studio ${modelLabel} model is not loaded: ${modelName}. ` +
      `Configure the model or override the environment variable to match a loaded model.`
  );
}

async function verifyLmStudioModels(): Promise<void> {
  console.log('[startup] Checking LM Studio models...');
  const response = await getLlmClient().models.list();
  const modelIds = response.data.map(model => model.id).filter(Boolean);
  const loadedModelIds = new Set(modelIds);

  if (loadedModelIds.size === 0) {
    throw new Error('LM Studio is reachable but returned no loaded models');
  }

  assertModelLoaded(loadedModelIds, config.chatModel, 'chat');
  assertModelLoaded(loadedModelIds, config.embeddingModel, 'embedding');

  console.log(`[startup] LM Studio models ready: ${collectAvailableModels(modelIds)}.`);
}

export async function verifyStartupDependencies(): Promise<void> {
  console.log('[startup] Verifying external dependencies...');
  await verifyLmStudioModels();
  await checkTranscriptionSupport();
  console.log('[startup] External dependencies are ready.');
}