import { describe, expect, test } from 'bun:test';
import { normalizeArchiveSummary } from './archive';

describe('archive classification', () => {
  test('normalizes an overlong model-generated summary instead of rejecting it', () => {
    const summary = `  ${'产品策略'.repeat(50)}  `;

    const normalized = normalizeArchiveSummary(summary);

    expect(Array.from(normalized)).toHaveLength(160);
    expect(normalized).toBe('产品策略'.repeat(40));
  });

  test('does not split Unicode code points at the summary boundary', () => {
    const summary = `${'想'.repeat(159)}🧠继续`;

    expect(normalizeArchiveSummary(summary)).toBe(`${'想'.repeat(159)}🧠`);
  });
});