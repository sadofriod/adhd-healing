import { mkdir, readdir, rm, stat } from 'fs/promises';
import { resolve } from 'path';
import { config } from '../src/config/env';
import { loadMcpConfig, resolveMcpEnvironment, type McpConfig } from '../src/services/mcpConfig';

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
const ROOT_OBSIDIAN_SAFE_FILES = new Set([
  'app.json',
  'appearance.json',
  'core-plugins.json',
  'workspace.json',
]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function compactEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function getNpxPackageSpec(args: readonly string[]): string | undefined {
  return args.find(argument => !argument.startsWith('-'));
}

export async function prefetchNpxMcpDependencies(
  mcpConfig: McpConfig,
  spawn: ProcessSpawner
): Promise<void> {
  const stdioServers = Object.entries(mcpConfig.servers).filter(
    (entry): entry is [string, Extract<McpConfig['servers'][string], { type: 'stdio' }>] =>
      entry[1].type === 'stdio'
  );

  for (const [serverName, server] of stdioServers) {
    if (server.command !== 'npx') continue;
    const packageSpec = getNpxPackageSpec(server.args);
    if (!packageSpec) {
      console.warn(`[runtime] Skipped dependency prefetch for ${serverName}: missing npx package spec.`);
      continue;
    }

    const prefetch = spawn(
      ['npm', 'exec', '--yes', '--package', packageSpec, '--', 'node', '-e', 'process.exit(0)'],
      {
        environment: {
          ...compactEnvironment(process.env),
          ...resolveMcpEnvironment(server.env, process.env),
        },
      }
    );
    const exitCode = await prefetch.exited;
    if (exitCode !== 0) {
      console.warn(
        `[runtime] Failed to prefetch MCP dependency for ${serverName} (${packageSpec}), exit code ${exitCode}.`
      );
      continue;
    }
    console.log(`[runtime] Prefetched MCP dependency for ${serverName}: ${packageSpec}`);
  }
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

function getRootObsidianPath(cwd: string): string {
  return resolve(cwd, '.obsidian');
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const entry = await stat(path);
    return entry.isDirectory();
  } catch {
    return false;
  }
}

async function listDirectoryEntries(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map(entry => String(entry.name));
}

function hasOnlySafeRootObsidianFiles(entries: readonly string[]): boolean {
  if (entries.length === 0) return true;
  return entries.every(entry => ROOT_OBSIDIAN_SAFE_FILES.has(entry));
}

export async function assertNoRootObsidianWorkspace(cwd: string = process.cwd()): Promise<void> {
  const rootObsidianPath = getRootObsidianPath(cwd);
  if (!await isDirectory(rootObsidianPath)) return;

  const entries = await listDirectoryEntries(rootObsidianPath);
  if (hasOnlySafeRootObsidianFiles(entries)) {
    await rm(rootObsidianPath, { recursive: true, force: true });
    console.warn(`[runtime] Removed unexpected root .obsidian directory: ${rootObsidianPath}`);
    return;
  }

  throw new Error(
    `[runtime] Unexpected root .obsidian directory detected at ${rootObsidianPath}. It contains non-standard files (${entries.join(', ')}). Move or remove it manually, then keep Obsidian workspaces under the configured vault path only: ${config.obsidianVaultPath}`
  );
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
  await assertNoRootObsidianWorkspace();
  const mcpConfig = await loadMcpConfig(config.mcpConfigPath);
  await prefetchNpxMcpDependencies(mcpConfig, spawn);
  await deployDatabaseMigrations(spawn);
  const endpoint = getLocalObsidianEndpoint(mcpConfig);
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

function getLocalObsidianEndpoint(mcpConfig: McpConfig): RuntimeEndpoint {
  const server = getObsidianServer(mcpConfig);
  const url = getLocalUrl(server.url);

  return {
    healthUrl: new URL('/health', url).href,
    port: getUrlPort(url),
  };
}
