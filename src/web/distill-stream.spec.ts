import { describe, expect, test } from 'bun:test';
import type { DistillStreamEvent, LlmTokenUsage } from '../types';
import { readDistillStream } from './distill-stream';

function createStreamResponse(events: readonly DistillStreamEvent[]): Response {
  const body = events.map(event => JSON.stringify(event)).join('\n');
  return new Response(body, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('distill activity stream', () => {
  test('reports progress before resolving the result', async () => {
    const sessionId = 'session-1';
    const progressEvents: Array<{ message: string; details?: string }> = [];
    const toolExchanges: Array<{
      operationId?: string;
      input?: unknown;
      output?: unknown;
    }> = [];
    const usageEvents: LlmTokenUsage[] = [];
    const response = createStreamResponse([
      { type: 'progress', phase: 'process', message: '正在分析' },
      {
        type: 'usage',
        source: '澄清决策',
        usage: { inputTokens: 320, outputTokens: 48, totalTokens: 368 },
        estimatedCostUsd: 0.00010976,
      },
      {
        type: 'progress',
        phase: 'tool-call',
        message: 'github_get_file_contents（MCP）',
        operationId: 'call-1',
        input: { path: 'README.md' },
        output: { content: '# Agent Company' },
      },
      { type: 'result', result: { status: 'CONTINUE', sessionId, text: '请补充目标用户' } },
    ]);

    const result = await readDistillStream(
      response,
      event => {
        if (event.type === 'usage') {
          usageEvents.push(event.usage);
          return;
        }
        if (event.operationId) {
          toolExchanges.push({
            operationId: event.operationId,
            input: event.input,
            output: event.output,
          });
        }
        progressEvents.push({
          message: event.message,
          details: event.details,
        });
      }
    );

    expect(progressEvents).toEqual([
      { message: '正在分析', details: undefined },
      {
        message: 'github_get_file_contents（MCP）',
        details: undefined,
      },
    ]);
    expect(usageEvents).toEqual([
      { inputTokens: 320, outputTokens: 48, totalTokens: 368 },
    ]);
    expect(toolExchanges).toEqual([{
      operationId: 'call-1',
      input: { path: 'README.md' },
      output: { content: '# Agent Company' },
    }]);
    expect(result).toEqual({ status: 'CONTINUE', sessionId, text: '请补充目标用户' });
  });

});

describe('distill result stream', () => {
  test('parses total token usage from the final result', async () => {
    const sessionId = 'session-2';
    const tokenUsage = { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 };
    const response = createStreamResponse([
      {
        type: 'result',
        result: { status: 'FINISH', sessionId, text: '已落地产物', tokenUsage },
      },
    ]);

    const result = await readDistillStream(response, () => undefined);

    expect(result).toEqual({ status: 'FINISH', sessionId, text: '已落地产物', tokenUsage });
  });

  test('returns a paused result for a recoverable network failure', async () => {
    const sessionId = 'session-3';
    const response = createStreamResponse([
      { type: 'result', result: { status: 'PAUSED', sessionId, text: 'fetch failed' } },
    ]);

    const result = await readDistillStream(response, () => undefined);

    expect(result).toEqual({ status: 'PAUSED', sessionId, text: 'fetch failed' });
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
