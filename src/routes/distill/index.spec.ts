import { describe, expect, test } from 'bun:test';
import type { DistillApiResponse } from '../../types';
import { createStreamResponse } from './index';

const REQUEST = { text: '测试长任务', reset: false };

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

describe('distill response stream lifecycle', () => {
  test('sends heartbeats while the processor is idle', async () => {
    const result: DistillApiResponse = { status: 'CONTINUE', text: '下一问' };
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
        return { status: 'CONTINUE', text: '不会写入已取消的流' };
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
});
