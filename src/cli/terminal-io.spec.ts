import { describe, expect, test } from 'bun:test';
import { normalizeTerminalInput } from './terminal-io';

describe('normalizeTerminalInput', () => {
  test('trims surrounding spaces and newlines', () => {
    expect(normalizeTerminalInput('  hello world\n')).toBe('hello world');
  });
});
