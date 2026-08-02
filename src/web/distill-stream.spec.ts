import { describe, expect, test } from 'bun:test';
import type { DistillStreamEvent } from '../types';
import { readDistillStream } from './distill-stream';

function createStreamResponse(events: readonly DistillStreamEvent[]): Response {
  const body = events.map(event => JSON.stringify(event)).join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('distill progress stream', () => {
  test('reports progress before resolving the result', async () => {
    const progressEvents: Array<{ message: string; details?: string }> = [];
    const response = createStreamResponse([
      { type: 'progress', phase: 'process', message: '正在分析' },
      {
        type: 'progress',
        phase: 'sub-agent',
        message: 'LLM 已形成最终决策',
        details: '建议先完成付费意愿访谈。',
      },
      { type: 'result', result: { status: 'CONTINUE', text: '请补充目标用户' } },
    ]);

    const result = await readDistillStream(
      response,
      progress => progressEvents.push({
        message: progress.message,
        details: progress.details,
      })
    );

    expect(progressEvents).toEqual([
      { message: '正在分析', details: undefined },
      {
        message: 'LLM 已形成最终决策',
        details: '建议先完成付费意愿访谈。',
      },
    ]);
    expect(result).toEqual({ status: 'CONTINUE', text: '请补充目标用户' });
  });

  test('surfaces a streamed server error', async () => {
    const response = createStreamResponse([
      { type: 'error', error: 'socket connection was closed unexpectedly' },
    ]);

    expect(readDistillStream(response, () => undefined)).rejects.toThrow(
      'socket connection was closed unexpectedly'
    );
  });
});
