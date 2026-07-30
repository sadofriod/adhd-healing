import { describe, expect, it } from 'bun:test';
import { validateDistillRequest } from './validate.js';

const VALID_SESSION_ID = '6dc4f04b-5b92-4b44-9f5d-59b7aa4f2df4';

describe('validateDistillRequest', () => {
  it('accepts JSON text requests with null session ids', async () => {
    const req = new Request('http://localhost:5001/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_mode: 'text',
        text: '把 iPhone 录音整理成网页输入流',
        session_id: null,
      }),
    });

    await expect(validateDistillRequest(req)).resolves.toEqual({
      inputMode: 'text',
      text: '把 iPhone 录音整理成网页输入流',
      sessionId: undefined,
    });
  });

  it('accepts JSON text requests and normalizes blank session ids', async () => {
    const req = new Request('http://localhost:5001/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_mode: 'text',
        text: '  想把今天的灵感收束成一个可执行实验  ',
        session_id: '   ',
      }),
    });

    await expect(validateDistillRequest(req)).resolves.toEqual({
      inputMode: 'text',
      text: '想把今天的灵感收束成一个可执行实验',
      sessionId: undefined,
    });
  });

  it('rejects JSON audio requests with a clear error', async () => {
    const req = new Request('http://localhost:5001/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_mode: 'audio',
        session_id: VALID_SESSION_ID,
      }),
    });

    await expect(validateDistillRequest(req)).rejects.toThrow(
      'JSON requests only support text mode'
    );
  });

  it('still accepts multipart text requests', async () => {
    const formData = new FormData();
    formData.set('input_mode', 'text');
    formData.set('text', '  记录今天的核心想法  ');
    formData.set('session_id', VALID_SESSION_ID);

    const req = new Request('http://localhost:5001/distill', {
      method: 'POST',
      body: formData,
    });

    await expect(validateDistillRequest(req)).resolves.toEqual({
      inputMode: 'text',
      text: '记录今天的核心想法',
      sessionId: VALID_SESSION_ID,
    });
  });
});