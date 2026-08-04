import { describe, expect, test } from 'bun:test';
import { getRequestLocale, normalizeLocale } from './locale';

describe('normalizeLocale', () => {
  test('normalizes locale variants to supported locale keys', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh');
    expect(normalizeLocale('en-US')).toBe('en');
  });

  test('falls back to zh for unsupported locales', () => {
    expect(normalizeLocale('fr-FR')).toBe('zh');
  });
});

describe('getRequestLocale', () => {
  test('prefers query locale over headers', () => {
    const req = new Request('http://localhost/sessions?lang=en', {
      headers: { 'x-locale': 'zh' },
    });
    expect(getRequestLocale(req)).toBe('en');
  });

  test('uses x-locale before accept-language', () => {
    const req = new Request('http://localhost/sessions', {
      headers: {
        'x-locale': 'en',
        'accept-language': 'zh-CN,zh;q=0.9',
      },
    });
    expect(getRequestLocale(req)).toBe('en');
  });

  test('falls back to accept-language', () => {
    const req = new Request('http://localhost/sessions', {
      headers: { 'accept-language': 'en-GB,en;q=0.9' },
    });
    expect(getRequestLocale(req)).toBe('en');
  });
});
