import { config } from '../config/env';
import { initializeMcpServers } from './mcp';

export async function verifyStartupDependencies(): Promise<void> {
  await initializeMcpServers(config.mcpConfigPath);
  console.log(`[startup] DeepSeek API key configured: ${config.deepseekApiKey.slice(0, 6)}...`);
  console.log(`[startup] Brain vault path: ${config.brainVaultPath}`);
  console.log('[startup] Dependencies verified.');
}
