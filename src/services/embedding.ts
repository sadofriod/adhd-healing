import { getLlmClient } from './llm-client.js';
import { config } from '../config/env.js';

const EMBEDDING_DIMENSIONS = 768;

function buildFallbackVector(): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => Math.random() * 2 - 1);
}

export async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await getLlmClient().embeddings.create({
      model: config.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    console.warn('[embedding] Model unavailable, using fallback vector:', error);
    return buildFallbackVector();
  }
}

export function formatVectorForPg(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
