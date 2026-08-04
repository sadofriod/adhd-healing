import { describe, expect, test } from 'bun:test';
import { validateDistillRequest } from './validate';

describe('validateDistillRequest i18n', () => {
  test('returns chinese validation message for zh locale', async () => {
    const request = new Request('http://localhost/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '  ' }),
    });

    await expect(validateDistillRequest(request, 'zh')).rejects.toThrow('text 必须是非空字符串');
  });

  test('returns english validation message for en locale', async () => {
    const request = new Request('http://localhost/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '  ' }),
    });

    await expect(validateDistillRequest(request, 'en')).rejects.toThrow('text must be a non-empty string');
  });
});
