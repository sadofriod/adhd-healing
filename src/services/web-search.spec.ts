import { describe, expect, it } from 'bun:test';
import { searchWeb } from './web-search.js';

function createFetchResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

describe('searchWeb', () => {
  it('aggregates search results from google, bing, and duckduckgo', async () => {
    const fetchImpl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);

      if (url.startsWith('https://www.google.com/search')) {
        return createFetchResponse([
          '<html><body>',
          '<a href="/url?q=https%3A%2F%2Fbun.sh%2Fblog%2Fbun-v1.2&sa=U">Bun 1.2 Release Notes</a>',
          '<div>The latest Bun release improves bundling and test performance.</div>',
          '</body></html>',
        ].join(''));
      }

      if (url.startsWith('https://www.bing.com/search')) {
        return createFetchResponse([
          '<rss><channel>',
          '<item>',
          '<title>Bun Runtime Roadmap</title>',
          '<link>https://bun.sh/roadmap</link>',
          '<description>Roadmap and current public status for upcoming Bun capabilities.</description>',
          '</item>',
          '</channel></rss>',
        ].join(''));
      }

      if (url.startsWith('https://html.duckduckgo.com/html/')) {
        return createFetchResponse([
          '<html><body>',
          '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fbun-news">Bun News Digest</a>',
          '<div class="result__snippet">A community summary of the latest Bun announcements.</div>',
          '</body></html>',
        ].join(''));
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await searchWeb('bun latest release', {
      engine: 'all',
      fetchImpl,
    });

    expect(result.attempted_engines).toEqual(['google', 'bing', 'duckduckgo']);
    expect(result.errors).toEqual([]);
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toEqual({
      engine: 'google',
      title: 'Bun 1.2 Release Notes',
      url: 'https://bun.sh/blog/bun-v1.2',
      snippet: 'The latest Bun release improves bundling and test performance.',
    });
    expect(result.results[1]).toEqual({
      engine: 'bing',
      title: 'Bun Runtime Roadmap',
      url: 'https://bun.sh/roadmap',
      snippet: 'Roadmap and current public status for upcoming Bun capabilities.',
    });
    expect(result.results[2]).toEqual({
      engine: 'duckduckgo',
      title: 'Bun News Digest',
      url: 'https://example.com/bun-news',
      snippet: 'A community summary of the latest Bun announcements.',
    });
  });

  it('records engine failures without failing the whole aggregated search', async () => {
    const fetchImpl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);

      if (url.startsWith('https://www.google.com/search')) {
        throw new Error('google blocked the request');
      }

      if (url.startsWith('https://www.bing.com/search')) {
        return createFetchResponse([
          '<rss><channel>',
          '<item>',
          '<title>Latest LM Studio docs</title>',
          '<link>https://lmstudio.ai/docs</link>',
          '<description>Current local model serving docs.</description>',
          '</item>',
          '</channel></rss>',
        ].join(''));
      }

      if (url.startsWith('https://html.duckduckgo.com/html/')) {
        return createFetchResponse('<html><body></body></html>');
      }

      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const result = await searchWeb('lm studio docs', {
      engine: 'all',
      fetchImpl,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.title).toBe('Latest LM Studio docs');
    expect(result.errors).toEqual(['google: google blocked the request']);
  });
});