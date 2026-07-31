import { tool } from 'ai';
import { z } from 'zod';
import { searchWeb } from '../web-search.js';

const BrowserSearchArgsSchema = z.object({
  query: z.string().trim().min(1).max(240),
  engine: z.enum(['google', 'duckduckgo', 'bing', 'all']).default('all'),
});

export function createBrowserSearchTool() {
  return tool({
    description: [
      'Search the public web when the user asks for current information, official docs, product updates, ecosystem changes, or external facts.',
      'Use Google, DuckDuckGo, Bing, or all of them.',
    ].join(' '),
    parameters: BrowserSearchArgsSchema,
    execute: async args => searchWeb(args.query, { engine: args.engine }),
  });
}