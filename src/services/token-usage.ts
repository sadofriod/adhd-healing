import type {
  LlmActivityReporter,
  LlmTokenUsage,
} from '../types';

type ProviderTokenUsage = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
};

const INPUT_USD_PER_MILLION_TOKENS = 0.28;
const OUTPUT_USD_PER_MILLION_TOKENS = 0.42;

export const EMPTY_TOKEN_USAGE: LlmTokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
};

export function toLlmTokenUsage(usage: ProviderTokenUsage): LlmTokenUsage {
  return {
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
  };
}

export function addTokenUsage(
  current: LlmTokenUsage,
  added: LlmTokenUsage
): LlmTokenUsage {
  return {
    inputTokens: current.inputTokens + added.inputTokens,
    outputTokens: current.outputTokens + added.outputTokens,
    totalTokens: current.totalTokens + added.totalTokens,
  };
}

export function estimateTokenCostUsd(usage: LlmTokenUsage): number {
  const inputCost = usage.inputTokens * INPUT_USD_PER_MILLION_TOKENS / 1_000_000;
  const outputCost = usage.outputTokens * OUTPUT_USD_PER_MILLION_TOKENS / 1_000_000;
  return inputCost + outputCost;
}

export function reportTokenUsages(
  source: string,
  usages: readonly ProviderTokenUsage[],
  reportActivity: LlmActivityReporter
): void {
  usages.forEach((usage, index) => {
    const stepSource = usages.length > 1 ? `${source} #${index + 1}` : source;
    const tokenUsage = toLlmTokenUsage(usage);
    reportActivity({
      type: 'usage',
      source: stepSource,
      usage: tokenUsage,
      estimatedCostUsd: estimateTokenCostUsd(tokenUsage),
    });
  });
}
