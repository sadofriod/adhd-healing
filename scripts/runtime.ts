import { mkdir } from 'fs/promises';
import { resolve } from 'path';
import { config } from '../src/config/env';
import { loadMcpConfig, type McpConfig } from '../src/services/mcpConfig';

export type ManagedProcess = ReturnType<typeof Bun.spawn>;

type SpawnOptions = {
  readonly cwd?: string;
  readonly environment?: Record<string, string | undefined>;
};

type ProcessSpawner = (command: string[], options?: SpawnOptions) => ManagedProcess;

type RuntimeEndpoint = {
  readonly healthUrl: string;
  readonly port: string;
};

const MCP_START_TIMEOUT_MS = 30_000;
const MCP_HEALTH_RETRY_MS = 250;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getObsidianServer(
  mcpConfig: McpConfig
): Extract<McpConfig['servers'][string], { type: 'sse' }> {
  const server = mcpConfig.servers.obsidian;
  if (!server || server.type !== 'sse') {
    throw new Error('mcp.json must define an SSE server named "obsidian"');
  }
  return server;
}

function getLocalUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Managed Obsidian MCP server must use a local URL, received: ${rawUrl}`);
  }
  return url;
}

function getUrlPort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === 'https:') return '443';
  return '80';
}

async function resolveObsidianEndpoint(): Promise<RuntimeEndpoint> {
  const mcpConfig = await loadMcpConfig(config.mcpConfigPath);
  const server = getObsidianServer(mcpConfig);
  const url = getLocalUrl(server.url);

  return {
    healthUrl: new URL('/health', url).href,
    port: getUrlPort(url),
  };
}

export function spawnManagedProcess(
  command: string[],
  options?: SpawnOptions
): ManagedProcess {
  return Bun.spawn(command, {
    cwd: options?.cwd ?? process.cwd(),
    env: options?.environment ?? process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

function resolveSqliteDatabaseUrl(): string {
  const fallbackUrl = `file:${resolve(process.cwd(), 'data/sessions.db')}`;
  const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

  if (!rawDatabaseUrl) return fallbackUrl;
  if (rawDatabaseUrl.startsWith('file:')) return rawDatabaseUrl;
  if (/^[a-z][a-z\d+.-]*:/i.test(rawDatabaseUrl)) {
    console.warn(
      `[runtime] DATABASE_URL uses an unsupported protocol for sqlite (${rawDatabaseUrl}). Falling back to ${fallbackUrl}.`
    );
    return fallbackUrl;
  }

  return `file:${resolve(process.cwd(), rawDatabaseUrl)}`;
}

async function deployDatabaseMigrations(spawn: ProcessSpawner): Promise<void> {
  const databaseUrl = resolveSqliteDatabaseUrl();
  const migration = spawn(['pnpm', 'exec', 'prisma', 'migrate', 'deploy'], {
    environment: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
  const exitCode = await migration.exited;
  if (exitCode !== 0) throw new Error(`database migration failed with code ${exitCode}`);
}

function assertProcessRunning(processName: string, child: ManagedProcess): void {
  if (child.exitCode !== null) {
    throw new Error(`${processName} exited before startup completed with code ${child.exitCode}`);
  }
}

async function probeHealth(healthUrl: string): Promise<string | undefined> {
  try {
    const response = await fetch(healthUrl);
    if (response.ok) return undefined;
    return `HTTP ${response.status}`;
  } catch (error) {
    return getErrorMessage(error);
  }
}

async function assertMcpEndpointAvailable(healthUrl: string): Promise<void> {
  try {
    await fetch(healthUrl);
  } catch {
    return;
  }
  throw new Error(`Obsidian MCP endpoint is already in use: ${healthUrl}`);
}

async function waitForMcp(child: ManagedProcess, healthUrl: string): Promise<void> {
  const deadline = Date.now() + MCP_START_TIMEOUT_MS;
  let lastError = 'health endpoint did not respond';

  while (Date.now() < deadline) {
    assertProcessRunning('obsidian-mcp', child);
    const healthError = await probeHealth(healthUrl);
    if (!healthError) return;
    lastError = healthError;
    await Bun.sleep(MCP_HEALTH_RETRY_MS);
  }

  throw new Error(`Obsidian MCP health check timed out: ${lastError}`);
}

export async function stopManagedProcess(
  child: ManagedProcess,
  signal: NodeJS.Signals = 'SIGTERM'
): Promise<void> {
  if (child.exitCode === null) child.kill(signal);
  await child.exited;
}

export async function withManagedRuntime<T>(
  run: (runtime: { readonly mcp: ManagedProcess }) => Promise<T>,
  spawn: ProcessSpawner = spawnManagedProcess
): Promise<T> {
  await deployDatabaseMigrations(spawn);
  const endpoint = await resolveObsidianEndpoint();
  await assertMcpEndpointAvailable(endpoint.healthUrl);
  await mkdir(config.obsidianVaultPath, { recursive: true });
  const mcp = spawn(['pnpm', 'exec', 'obsidian-mcp-server'], {
    cwd: config.obsidianVaultPath,
    environment: {
      ...process.env,
      VAULT_PATH: config.obsidianVaultPath,
      PORT: endpoint.port,
    },
  });

  try {
    await waitForMcp(mcp, endpoint.healthUrl);
    console.log(`[runtime] Obsidian MCP is healthy at ${endpoint.healthUrl}`);
    return await run({ mcp });
  } finally {
    await stopManagedProcess(mcp);
  }
}
