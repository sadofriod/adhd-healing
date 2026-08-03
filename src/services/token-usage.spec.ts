import { describe, expect, test } from 'bun:test';
import {
  addTokenUsage,
  estimateTokenCostUsd,
  reportTokenUsages,
  toLlmTokenUsage,
} from './token-usage';

describe('token usage', () => {
  test('maps provider usage and adds totals', () => {
    const first = toLlmTokenUsage({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
    });
    const second = toLlmTokenUsage({
      promptTokens: 80,
      completionTokens: 20,
      totalTokens: 100,
    });

    expect(addTokenUsage(first, second)).toEqual({
      inputTokens: 200,
      outputTokens: 50,
      totalTokens: 250,
    });
  });

  test('reports each model step separately', () => {
    const sources: string[] = [];
    reportTokenUsages('澄清决策', [
      { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      { promptTokens: 150, completionTokens: 30, totalTokens: 180 },
    ], event => {
      if (event.type === 'usage') sources.push(event.source);
    });

    expect(sources).toEqual(['澄清决策 #1', '澄清决策 #2']);
  });

  test('estimates DeepSeek cost from input and output rates', () => {
    expect(estimateTokenCostUsd({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
    })).toBeCloseTo(0.7);
  });
});
