import { describe, expect, it } from 'bun:test';
import { buildVaultFilename } from './vault.js';

describe('buildVaultFilename', () => {
  it('adds a compact timestamp to avoid same-day overwrites', () => {
    const first = buildVaultFilename('重复标题', new Date('2026-07-29T10:11:12.123Z'));
    const second = buildVaultFilename('重复标题', new Date('2026-07-29T10:11:12.124Z'));

    expect(first).toBe('2026-07-29-101112123-重复标题.md');
    expect(second).toBe('2026-07-29-101112124-重复标题.md');
  });

  it('falls back to a safe placeholder when the title sanitizes to empty', () => {
    const filename = buildVaultFilename('***', new Date('2026-07-29T10:11:12.123Z'));

    expect(filename).toBe('2026-07-29-101112123-untitled-idea.md');
  });
});