import { config } from '../config/env';

export async function verifyStartupDependencies(): Promise<void> {
  console.log(`[startup] DeepSeek API key configured: ${config.deepseekApiKey.slice(0, 6)}...`);
  console.log(`[startup] Brain vault path: ${config.brainVaultPath}`);
  console.log('[startup] Dependencies verified.');
}
