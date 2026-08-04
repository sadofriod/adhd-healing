import { describe, expect, test } from 'bun:test';
import type { DistillApiResponse } from '../../types';
import { createStreamResponse } from './index';

const REQUEST = { text: '测试长任务', reset: false };

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

describe('distill response stream lifecycle', () => {
  test('sends heartbeats while the processor is idle', async () => {
    const result: DistillApiResponse = { status: 'CONTINUE', sessionId: 'session-1', text: '下一问' };
    const response = createStreamResponse(
      REQUEST,
      'heartbeat-test',
      Date.now(),
      async () => {
        await delay(18);
        return result;
      },
      5
    );

    const body = await response.text();

    expect(body.startsWith('\n')).toBeTrue();
    expect(body).toContain(JSON.stringify({ type: 'result', result }));
  });

  test('does not write or close after the reader cancels', async () => {
    let finishProcessor = (): void => undefined;
    const processorGate = new Promise<void>(resolve => {
      finishProcessor = resolve;
    });
    let processorCompleted = false;
    const response = createStreamResponse(
      REQUEST,
      'cancel-test',
      Date.now(),
      async () => {
        await processorGate;
        processorCompleted = true;
        return { status: 'CONTINUE', sessionId: 'session-2', text: '不会写入已取消的流' };
      },
      5
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Expected a response body');

    await reader.cancel();
    finishProcessor();
    await delay(1);

    expect(processorCompleted).toBeTrue();
  });

  test('pauses a task when the processor encounters a network failure', async () => {
    const response = createStreamResponse(
      REQUEST,
      'network-test',
      Date.now(),
      async () => {
        throw new TypeError('fetch failed');
      },
      5
    );

    const body = await response.text();

    const resultEvent = JSON.parse(body.trim()) as {
      readonly type: string;
      readonly result?: {
        readonly status: string;
        readonly sessionId: string;
        readonly text: string;
      };
    };

    expect(resultEvent.type).toBe('result');
    expect(resultEvent.result?.status).toBe('PAUSED');
    expect(resultEvent.result?.text).toBe('fetch failed');
    expect(resultEvent.result?.sessionId.length).toBeGreaterThan(0);
    expect(body).not.toContain('"type":"error"');
  });
});
