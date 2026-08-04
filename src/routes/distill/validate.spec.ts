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

  test('accepts structured file attachments', async () => {
    const request = new Request('http://localhost/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Read the attached file',
        attachments: [
          {
            name: 'notes.md',
            content: '# hello',
            mimeType: 'text/markdown',
            size: 7,
          },
        ],
      }),
    });

    await expect(validateDistillRequest(request)).resolves.toMatchObject({
      text: 'Read the attached file',
      attachments: [
        {
          name: 'notes.md',
          content: '# hello',
          mimeType: 'text/markdown',
          size: 7,
        },
      ],
    });
  });
});
