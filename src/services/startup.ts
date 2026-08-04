import { config } from '../config/env';
import { initializeMcpServers } from './mcp';
import { ensureObsidianCliAvailable } from './obsidian-writer';

export async function verifyStartupDependencies(): Promise<void> {
  await initializeMcpServers(config.mcpConfigPath);
  if (config.obsidianWriteBackend !== 'mcp') {
    await ensureObsidianCliAvailable(config.obsidianCliCommand);
  }
  console.log(`[startup] DeepSeek API key configured: ${config.deepseekApiKey.slice(0, 6)}...`);
  console.log(`[startup] Obsidian vault path: ${config.obsidianVaultPath}`);
  console.log('[startup] Dependencies verified.');
}
