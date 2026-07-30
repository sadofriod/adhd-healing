import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import type { Completion } from 'openai/resources/completions.js';
import type { WebSearchResponse } from './web-search.js';

type CreateParams = Readonly<{
  model: string;
  messages: readonly unknown[];
  tools?: readonly unknown[];
  tool_choice?: string;
}>;

type CompletionCreateParams = Readonly<{
  model: string;
  prompt: string | readonly string[] | readonly number[] | readonly (readonly number[])[] | null;
  max_tokens?: number | null;
  temperature?: number | null;
}>;

type TestState = {
  chatResponses: Array<ChatCompletion | Error>;
  completionResponses: Completion[];
  searchResponse: WebSearchResponse;
};

type TestCalls = {
  create: CreateParams[];
  complete: CompletionCreateParams[];
  fetchUrls: string[];
};

function createChatCompletion(message: ChatCompletion['choices'][number]['message']): ChatCompletion {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 0,
    model: 'qwen2.5-7b-instruct',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        message,
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

function createTextCompletion(text: string): Completion {
  return {
    id: 'cmpl-test',
    object: 'text_completion',
    created: 0,
    model: 'google/gemma-4-12b',
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
        text,
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

function buildDefaultState(): TestState {
  return {
    chatResponses: [],
    completionResponses: [],
    searchResponse: {
      query: 'bun 1.2 release notes',
      attempted_engines: ['bing'],
      errors: [],
      results: [
        {
          engine: 'bing',
          title: 'Bun 1.2 Release Notes',
          url: 'https://bun.sh/blog/bun-v1.2',
          snippet: 'The release adds a faster bundler and test runner improvements.',
        },
      ],
    },
  };
}

function buildCalls(): TestCalls {
  return {
    create: [],
    complete: [],
    fetchUrls: [],
  };
}

let state = buildDefaultState();
let calls = buildCalls();
const originalFetch = globalThis.fetch;

mock.module('./llm-client.js', () => ({
  getLlmClient: () => ({
    chat: {
      completions: {
        create: async (params: CreateParams): Promise<ChatCompletion> => {
          calls.create.push(params);
          const response = state.chatResponses.shift();
          if (!response) {
            throw new Error('No mocked chat completion left');
          }

          if (response instanceof Error) {
            throw response;
          }

          return response;
        },
      },
    },
    completions: {
      create: async (params: CompletionCreateParams): Promise<Completion> => {
        calls.complete.push(params);
        const response = state.completionResponses.shift();
        if (!response) {
          throw new Error('No mocked text completion left');
        }

        return response;
      },
    },
  }),
}));

const { callLlmForClarifyOrFinal, resetCompletionFallbackModels } = await import('./clarification.js');

beforeEach(() => {
  state = buildDefaultState();
  calls = buildCalls();
  resetCompletionFallbackModels();
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    calls.fetchUrls.push(url);

    if (!url.startsWith('https://www.bing.com/search?format=rss&q=')) {
      throw new Error(`Unexpected URL: ${url}`);
    }

    const result = state.searchResponse.results[0];
    if (!result) {
      throw new Error('Missing mocked search result');
    }

    return new Response([
      '<rss><channel>',
      '<item>',
      `<title>${result.title}</title>`,
      `<link>${result.url}</link>`,
      `<description>${result.snippet}</description>`,
      '</item>',
      '</channel></rss>',
    ].join(''), {
      status: 200,
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('callLlmForClarifyOrFinal', () => {
  it('executes browser_search tool calls before returning the final decision', async () => {
    state.chatResponses = [
      createChatCompletion({
        role: 'assistant',
        content: null,
        refusal: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'browser_search',
              arguments: JSON.stringify({
                query: 'bun 1.2 release notes',
                engine: 'bing',
              }),
            },
          },
        ],
      }),
      createChatCompletion({
        role: 'assistant',
        content: '{"type":"clarify","message":"你更关心 Bun 1.2 里和你的方案相关的哪一部分？"}',
        refusal: null,
      }),
    ];

    const result = await callLlmForClarifyOrFinal(
      '用户: 我想知道 Bun 最近更新了什么，是否适合这个想法。',
      '无相关历史记录'
    );

    expect(result).toEqual({
      type: 'clarify',
      message: '你更关心 Bun 1.2 里和你的方案相关的哪一部分？',
    });
    expect(calls.fetchUrls).toEqual([
      'https://www.bing.com/search?format=rss&q=bun%201.2%20release%20notes',
    ]);
    expect(calls.create).toHaveLength(2);
    expect(calls.create[0]?.tools).toHaveLength(1);
    expect(calls.create[1]?.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: JSON.stringify(state.searchResponse),
    });
  });

  it('falls back to plain completions when LM Studio rejects the chat template', async () => {
    state.chatResponses = [
      new Error(
        '400 "Error rendering prompt with jinja template: \\\"Unknown test: sequence\\\"."'
      ),
    ];
    state.completionResponses = [
      createTextCompletion('{"type":"clarify","message":"你最想先验证这个插件的技术可行性，还是商业化路径？"}')
    ];

    const result = await callLlmForClarifyOrFinal(
      '用户: Freecad 3D打印快速切片插件的实现（使用Rust作为高性能计算核心）和商业化',
      '无相关历史记录'
    );

    expect(result).toEqual({
      type: 'clarify',
      message: '你最想先验证这个插件的技术可行性，还是商业化路径？',
    });
    expect(calls.create).toHaveLength(1);
    expect(calls.complete).toHaveLength(1);
    expect(String(calls.complete[0]?.prompt)).toContain('不支持 chat prompt template 或 tool calling');
    expect(calls.fetchUrls).toEqual([]);
  });

  it('reuses the completion fallback after the first compatibility failure', async () => {
    state.chatResponses = [
      new Error(
        '400 "Error rendering prompt with jinja template: \\\"Unknown test: sequence\\\"."'
      ),
    ];
    state.completionResponses = [
      createTextCompletion('{"type":"clarify","message":"你最想先验证技术可行性还是用户价值？"}'),
      createTextCompletion('{"type":"clarify","message":"这个插件的首批目标用户是谁？"}'),
    ];

    const firstResult = await callLlmForClarifyOrFinal(
      '用户: Freecad 3D打印快速切片插件的实现（使用Rust作为高性能计算核心）和商业化',
      '无相关历史记录'
    );
    const secondResult = await callLlmForClarifyOrFinal(
      '用户: 产出的是一个Freecad插件，加速超大模型的切片速度',
      '无相关历史记录'
    );

    expect(firstResult).toEqual({
      type: 'clarify',
      message: '你最想先验证技术可行性还是用户价值？',
    });
    expect(secondResult).toEqual({
      type: 'clarify',
      message: '这个插件的首批目标用户是谁？',
    });
    expect(calls.create).toHaveLength(1);
    expect(calls.complete).toHaveLength(2);
  });
});