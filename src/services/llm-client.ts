import { createOpenAI } from '@ai-sdk/openai';
import { config } from '../config/env';

let _client: ReturnType<typeof createOpenAI> | null = null;

export function getLlmClient(): ReturnType<typeof createOpenAI> {
  if (!_client) {
    _client = createOpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: config.deepseekApiKey,
    });
  }
  return _client;
}

export const CHAT_MODEL = 'deepseek-chat';

