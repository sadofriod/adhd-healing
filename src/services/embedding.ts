import { getLlmClient } from './llm-client.js';
import { config } from '../config/env.js';

const EMBEDDING_DIMENSIONS = 768;

function normalizeVectorDimensions(vector: number[]): number[] {
  if (vector.length === EMBEDDING_DIMENSIONS) return vector;

  console.warn(
    `[embedding] Expected ${EMBEDDING_DIMENSIONS} dimensions, got ${vector.length}. Normalizing vector.`
  );

  if (vector.length > EMBEDDING_DIMENSIONS) {
    return vector.slice(0, EMBEDDING_DIMENSIONS);
  }

  return [...vector, ...Array.from({ length: EMBEDDING_DIMENSIONS - vector.length }, () => 0)];
}

export async function getEmbedding(text: string): Promise<number[]> {
  const response = await getLlmClient().embeddings.create({
    model: config.embeddingModel,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return normalizeVectorDimensions(response.data[0].embedding);
}

export function formatVectorForPg(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
