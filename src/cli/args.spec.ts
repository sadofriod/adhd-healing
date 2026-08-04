import { describe, expect, test } from 'bun:test';
import { buildCliUsage, parseCliOptions } from './args';

describe('parseCliOptions', () => {
  test('parses --new', () => {
    expect(parseCliOptions(['--new'])).toEqual({
      help: false,
      startNewSession: true,
    });
  });

  test('parses --session', () => {
    expect(parseCliOptions(['--session', 'abc-123'])).toEqual({
      help: false,
      startNewSession: false,
      sessionId: 'abc-123',
    });
  });

  test('parses help flag', () => {
    expect(parseCliOptions(['-h'])).toEqual({
      help: true,
      startNewSession: false,
    });
  });

  test('rejects conflicting options', () => {
    expect(() => parseCliOptions(['--new', '--session', 'abc'])).toThrow(
      'Cannot combine --new with --session'
    );
  });

  test('rejects unknown options', () => {
    expect(() => parseCliOptions(['--unknown'])).toThrow('Unknown option: --unknown');
  });
});

describe('buildCliUsage', () => {
  test('includes session switch help', () => {
    expect(buildCliUsage()).toContain('/switch <id|n>');
  });
});
