const USER_AGENT = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/127.0.0.0 Safari/537.36',
].join(' ');

const MAX_RESULTS_PER_ENGINE = 5;

export type SearchEngine = 'google' | 'duckduckgo' | 'bing' | 'all';

export type SearchResult = {
  engine: Exclude<SearchEngine, 'all'>;
  title: string;
  url: string;
  snippet: string;
};

type EngineResult = {
  engine: Exclude<SearchEngine, 'all'>;
  results: SearchResult[];
};

type MatchMapper = (match: RegExpMatchArray) => SearchResult;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function createSearchUrl(engine: Exclude<SearchEngine, 'all'>, query: string): string {
  const encoded = encodeURIComponent(query);

  if (engine === 'google') return `https://www.google.com/search?gbv=1&q=${encoded}`;
  if (engine === 'bing') return `https://www.bing.com/search?format=rss&q=${encoded}`;
  return `https://duckduckgo.com/html/?q=${encoded}`;
}

function normalizeGoogleUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl, 'https://www.google.com');
    const actualUrl = parsed.searchParams.get('q');
    if (actualUrl) return actualUrl;
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

function buildSearchHeaders(): HeadersInit {
  return {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.8,zh-CN;q=0.6,zh;q=0.5',
  };
}

async function fetchSearchPage(engine: Exclude<SearchEngine, 'all'>, query: string): Promise<string> {
  const response = await fetch(createSearchUrl(engine, query), {
    headers: buildSearchHeaders(),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`[web-search] ${engine} search failed with status ${response.status}`);
  }

  return response.text();
}

function limitResults<T>(results: readonly T[]): T[] {
  return results.slice(0, MAX_RESULTS_PER_ENGINE);
}

function collectRegexResults(html: string, pattern: RegExp, mapper: MatchMapper): SearchResult[] {
  const results: SearchResult[] = [];

  for (const match of html.matchAll(pattern)) {
    results.push(mapper(match));
  }

  return limitResults(results.filter(result => result.title && result.url));
}

function getMatchPart(match: RegExpMatchArray, index: number): string {
  return match[index] ?? '';
}

function mapDuckDuckGoResult(match: RegExpMatchArray): SearchResult {
  const url = getMatchPart(match, 1);
  const title = getMatchPart(match, 2);
  const snippet = getMatchPart(match, 3);
  return {
    engine: 'duckduckgo',
    title: stripTags(title),
    url,
    snippet: stripTags(snippet),
  };
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const pattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/g;
  return collectRegexResults(html, pattern, mapDuckDuckGoResult);
}

function mapBingResult(match: RegExpMatchArray): SearchResult {
  const title = getMatchPart(match, 1);
  const url = getMatchPart(match, 2);
  const snippet = getMatchPart(match, 3);
  return {
    engine: 'bing',
    title: stripTags(title),
    url,
    snippet: stripTags(snippet),
  };
}

function parseBingResults(html: string): SearchResult[] {
  const pattern = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/g;
  return collectRegexResults(html, pattern, mapBingResult);
}

function mapGoogleResult(match: RegExpMatchArray): SearchResult {
  const rawUrl = getMatchPart(match, 1);
  const title = getMatchPart(match, 2);
  const snippet = getMatchPart(match, 3);
  return {
    engine: 'google',
    title: stripTags(title),
    url: normalizeGoogleUrl(rawUrl),
    snippet: stripTags(snippet),
  };
}

function parseGoogleResults(html: string): SearchResult[] {
  const pattern = /<a href="(\/url\?q=[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?(?:<div[^>]*class="[^"]*VwiC3b[^"]*"[^>]*>([\s\S]*?)<\/div>)?/g;
  return collectRegexResults(html, pattern, mapGoogleResult);
}

function parseResults(engine: Exclude<SearchEngine, 'all'>, html: string): SearchResult[] {
  if (engine === 'google') return parseGoogleResults(html);
  if (engine === 'bing') return parseBingResults(html);
  return parseDuckDuckGoResults(html);
}

function getGoogleBlockedReason(html: string): string | null {
  if (html.includes('/httpservice/retry/enablejs')) {
    return '[web-search] google returned an enable-javascript interstitial';
  }

  return null;
}

function getDuckDuckGoBlockedReason(html: string): string | null {
  if (html.includes('anomaly-modal')) {
    return '[web-search] duckduckgo returned an anti-bot challenge';
  }

  return null;
}

function detectBlockedPage(engine: Exclude<SearchEngine, 'all'>, html: string): string | null {
  if (engine === 'google') return getGoogleBlockedReason(html);
  if (engine === 'duckduckgo') return getDuckDuckGoBlockedReason(html);
  return null;
}

async function searchSingleEngine(engine: Exclude<SearchEngine, 'all'>, query: string): Promise<EngineResult> {
  const html = await fetchSearchPage(engine, query);
  const blockedReason = detectBlockedPage(engine, html);
  if (blockedReason) {
    throw new Error(blockedReason);
  }

  const results = parseResults(engine, html);
  if (results.length === 0) {
    throw new Error(`[web-search] ${engine} returned no parseable results`);
  }

  return {
    engine,
    results,
  };
}

function getRequestedEngines(engine: SearchEngine): Exclude<SearchEngine, 'all'>[] {
  if (engine === 'all') return ['google', 'duckduckgo', 'bing'];
  return [engine];
}

function flattenResults(engineResults: readonly EngineResult[]): SearchResult[] {
  return engineResults.flatMap(result => result.results);
}

export async function searchWeb(
  query: string,
  options: { engine?: SearchEngine } = {}
): Promise<{
  query: string;
  engine: SearchEngine;
  results: SearchResult[];
  errors: string[];
}> {
  const engine = options.engine ?? 'all';
  const requestedEngines = getRequestedEngines(engine);
  const settled = await Promise.allSettled(requestedEngines.map(requested => searchSingleEngine(requested, query)));
  const engineResults = settled
    .filter((item): item is PromiseFulfilledResult<EngineResult> => item.status === 'fulfilled')
    .map(item => item.value);
  const errors = settled
    .filter((item): item is PromiseRejectedResult => item.status === 'rejected')
    .map(item => String(item.reason));

  return {
    query,
    engine,
    results: flattenResults(engineResults),
    errors,
  };
}
