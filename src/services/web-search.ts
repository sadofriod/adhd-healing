const SEARCH_ENGINES = ['google', 'bing', 'duckduckgo'] as const;
const DEFAULT_RESULT_LIMIT = 6;
const PER_ENGINE_RESULT_LIMIT = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const SEARCH_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'AppleWebKit/537.36 (KHTML, like Gecko)',
    'Chrome/126.0.0.0 Safari/537.36',
  ].join(' '),
} as const;

const GOOGLE_RESULT_PATTERN = /<a[^>]+href="\/url\?q=([^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,600}?)(?=<a[^>]+href="\/url\?q=|$)/g;
const BING_RSS_ITEM_PATTERN = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<description>([\s\S]*?)<\/description>[\s\S]*?<\/item>/g;
const DUCKDUCKGO_RESULT_PATTERN = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,600}?)(?=<a[^>]+class="[^"]*result__a|$)/g;

export type SearchEngine = typeof SEARCH_ENGINES[number];
export type SearchEnginePreference = SearchEngine | 'all';

export type WebSearchResult = Readonly<{
  engine: SearchEngine;
  title: string;
  url: string;
  snippet: string;
}>;

export type WebSearchResponse = Readonly<{
  query: string;
  attempted_engines: readonly SearchEngine[];
  errors: readonly string[];
  results: readonly WebSearchResult[];
}>;

type SearchOptions = Readonly<{
  engine?: SearchEnginePreference;
  fetchImpl?: typeof fetch;
  resultLimit?: number;
}>;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, codePoint: string) => {
      return String.fromCodePoint(Number.parseInt(codePoint, 10));
    })
    .replace(/&#x([\da-f]+);/gi, (_, codePoint: string) => {
      return String.fromCodePoint(Number.parseInt(codePoint, 16));
    })
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function cleanText(value: string): string {
  return collapseWhitespace(decodeHtmlEntities(stripTags(value)));
}

function truncateSnippet(value: string): string {
  if (value.length <= 280) return value;
  return `${value.slice(0, 277).trimEnd()}...`;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function unwrapGoogleUrl(rawUrl: string): string {
  const decodedUrl = decodeHtmlEntities(rawUrl);

  try {
    const directUrl = decodeURIComponent(decodedUrl);
    if (isHttpUrl(directUrl)) return directUrl;
  } catch {
    // Ignore malformed direct URLs and continue with query-param parsing.
  }

  try {
    const url = new URL(decodedUrl, 'https://www.google.com');
    const nested = url.searchParams.get('q');
    return nested ? decodeURIComponent(nested) : url.toString();
  } catch {
    return decodedUrl;
  }
}

function unwrapDuckDuckGoUrl(rawUrl: string): string {
  const decodedUrl = decodeHtmlEntities(rawUrl);
  const normalizedUrl = decodedUrl.startsWith('//') ? `https:${decodedUrl}` : decodedUrl;

  try {
    const url = new URL(normalizedUrl, 'https://duckduckgo.com');
    const nested = url.searchParams.get('uddg');
    return nested ? decodeURIComponent(nested) : url.toString();
  } catch {
    return normalizedUrl;
  }
}

function extractSnippet(block: string, title: string): string {
  const text = cleanText(block);
  if (!text) return '';
  const withoutTitle = collapseWhitespace(text.replace(title, ' '));
  return truncateSnippet(withoutTitle);
}

function buildGoogleSearchUrl(query: string): string {
  return `https://www.google.com/search?gbv=1&hl=en&num=${PER_ENGINE_RESULT_LIMIT}&q=${encodeURIComponent(query)}`;
}

function buildBingSearchUrl(query: string): string {
  return `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
}

function buildDuckDuckGoSearchUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?kl=us-en&q=${encodeURIComponent(query)}`;
}

function getRequestedEngines(engine: SearchEnginePreference): readonly SearchEngine[] {
  if (engine === 'all') return SEARCH_ENGINES;
  return [engine];
}

function filterResults(results: readonly WebSearchResult[]): readonly WebSearchResult[] {
  const seenUrls = new Set<string>();

  return results.filter(result => {
    if (!result.title || !result.snippet || !isHttpUrl(result.url)) return false;
    if (seenUrls.has(result.url)) return false;
    seenUrls.add(result.url);
    return true;
  });
}

function parseGoogleResults(html: string): readonly WebSearchResult[] {
  const matches = html.matchAll(GOOGLE_RESULT_PATTERN);
  const results: WebSearchResult[] = [];

  for (const match of matches) {
    const [, rawUrl = '', titleHtml = '', block = ''] = match;
    const url = unwrapGoogleUrl(rawUrl);
    if (!isHttpUrl(url) || url.includes('google.com')) continue;

    const title = cleanText(titleHtml);
    const snippet = extractSnippet(block, title);
    results.push({ engine: 'google', title, url, snippet });
    if (results.length >= PER_ENGINE_RESULT_LIMIT) break;
  }

  return filterResults(results);
}

function parseBingResults(xml: string): readonly WebSearchResult[] {
  const matches = xml.matchAll(BING_RSS_ITEM_PATTERN);
  const results: WebSearchResult[] = [];

  for (const match of matches) {
    const [, titleXml = '', rawUrl = '', descriptionXml = ''] = match;
    const title = cleanText(titleXml);
    const url = cleanText(rawUrl);
    const snippet = truncateSnippet(cleanText(descriptionXml));
    results.push({ engine: 'bing', title, url, snippet });
    if (results.length >= PER_ENGINE_RESULT_LIMIT) break;
  }

  return filterResults(results);
}

function parseDuckDuckGoResults(html: string): readonly WebSearchResult[] {
  const matches = html.matchAll(DUCKDUCKGO_RESULT_PATTERN);
  const results: WebSearchResult[] = [];

  for (const match of matches) {
    const [, rawUrl = '', titleHtml = '', block = ''] = match;
    const title = cleanText(titleHtml);
    const url = unwrapDuckDuckGoUrl(rawUrl);
    const snippet = extractSnippet(block, title);
    results.push({ engine: 'duckduckgo', title, url, snippet });
    if (results.length >= PER_ENGINE_RESULT_LIMIT) break;
  }

  return filterResults(results);
}

function parseResults(engine: SearchEngine, content: string): readonly WebSearchResult[] {
  switch (engine) {
    case 'google':
      return parseGoogleResults(content);
    case 'bing':
      return parseBingResults(content);
    case 'duckduckgo':
      return parseDuckDuckGoResults(content);
  }
}

function buildEngineUrl(engine: SearchEngine, query: string): string {
  switch (engine) {
    case 'google':
      return buildGoogleSearchUrl(query);
    case 'bing':
      return buildBingSearchUrl(query);
    case 'duckduckgo':
      return buildDuckDuckGoSearchUrl(query);
  }
}

function normalizeQuery(query: string): string {
  return collapseWhitespace(query).slice(0, 240);
}

async function searchEngine(
  engine: SearchEngine,
  query: string,
  fetchImpl: typeof fetch
): Promise<readonly WebSearchResult[]> {
  const response = await fetchImpl(buildEngineUrl(engine, query), {
    headers: SEARCH_HEADERS,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${engine} responded with ${response.status}`);
  }

  const content = await response.text();
  return parseResults(engine, content);
}

export async function searchWeb(
  query: string,
  options: SearchOptions = {}
): Promise<WebSearchResponse> {
  const normalizedQuery = normalizeQuery(query);
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestedEngines = getRequestedEngines(options.engine ?? 'all');
  const resultLimit = options.resultLimit ?? DEFAULT_RESULT_LIMIT;

  const settledResults = await Promise.allSettled(
    requestedEngines.map(async engine => ({
      engine,
      results: await searchEngine(engine, normalizedQuery, fetchImpl),
    }))
  );

  const errors: string[] = [];
  const aggregated: WebSearchResult[] = [];

  settledResults.forEach((result, index) => {
    const engine = requestedEngines[index];
    if (!engine) return;

    if (result.status === 'fulfilled') {
      aggregated.push(...result.value.results);
      return;
    }

    errors.push(`${engine}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });

  return {
    query: normalizedQuery,
    attempted_engines: requestedEngines,
    errors,
    results: filterResults(aggregated).slice(0, resultLimit),
  };
}