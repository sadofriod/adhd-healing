import OpenAI from 'openai';
import { config } from '../config/env.js';

let _client: OpenAI | null = null;

export function getLlmClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: config.lmStudioBaseUrl,
      apiKey: 'lm-studio',
    });
  }
  return _client;
}
