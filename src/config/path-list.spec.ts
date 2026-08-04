import { describe, expect, test } from 'bun:test';
import { parsePathList } from './path-list';

describe('parsePathList', () => {
  test('parses JSON arrays', () => {
    expect(parsePathList('["/tmp/a", "/tmp/b"]')).toEqual(['/tmp/a', '/tmp/b']);
  });

  test('parses comma and newline separated paths', () => {
    expect(parsePathList('/tmp/a, /tmp/b\n/tmp/c')).toEqual(['/tmp/a', '/tmp/b', '/tmp/c']);
  });

  test('returns an empty list for blank input', () => {
    expect(parsePathList('   ')).toEqual([]);
  });
});