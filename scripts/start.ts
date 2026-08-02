import { mkdir } from 'fs/promises';
import { config } from '../src/config/env';
import { loadMcpConfig, type McpConfig } from '../src/services/mcpConfig';

type ManagedProcess = ReturnType<typeof Bun.spawn>;
type ProcessName = 'gateway' | 'obsidian-mcp';
type ProcessExit = {
  readonly name: ProcessName;
  readonly code: number;
};

const MCP_START_TIMEOUT_MS = 30_000;
const MCP_HEALTH_RETRY_MS = 250;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

let requestedExitCode: number | undefined;

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

async function resolveObsidianEndpoint(): Promise<{ readonly healthUrl: string; readonly port: string }> {
  const mcpConfig = await loadMcpConfig(config.mcpConfigPath);
  const server = getObsidianServer(mcpConfig);
  const url = getLocalUrl(server.url);

  return {
    healthUrl: new URL('/health', url).href,
    port: getUrlPort(url),
  };
}

function spawnProcess(command: string[], environment?: Record<string, string | undefined>): ManagedProcess {
  return Bun.spawn(command, {
    cwd: process.cwd(),
    env: environment ?? process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

function assertProcessRunning(processName: ProcessName, child: ManagedProcess): void {
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

async function stopProcess(child: ManagedProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  if (child.exitCode === null) child.kill(signal);
  await child.exited;
}

async function stopProcesses(children: readonly ManagedProcess[], signal: NodeJS.Signals): Promise<void> {
  await Promise.all(children.map(child => stopProcess(child, signal)));
}

function registerSignalHandlers(children: readonly ManagedProcess[]): void {
  const signals: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal, index) => {
    process.once(signal, () => {
      requestedExitCode = 128 + (index === 0 ? 2 : 15);
      void stopProcesses(children, signal);
    });
  });
}

function watchProcess(name: ProcessName, child: ManagedProcess): Promise<ProcessExit> {
  return child.exited.then(code => ({ name, code }));
}

function getExitCode(exit: ProcessExit): number {
  if (requestedExitCode !== undefined) return requestedExitCode;
  if (exit.name === 'obsidian-mcp') {
    console.error(`[start] Obsidian MCP exited unexpectedly with code ${exit.code}.`);
    return 1;
  }
  return exit.code;
}

async function start(): Promise<number> {
  const endpoint = await resolveObsidianEndpoint();
  await assertMcpEndpointAvailable(endpoint.healthUrl);
  await mkdir(config.obsidianVaultPath, { recursive: true });
  const mcp = spawnProcess(['pnpm', 'exec', 'obsidian-mcp-server'], {
    ...process.env,
    VAULT_PATH: config.obsidianVaultPath,
    PORT: endpoint.port,
  });

  try {
    await waitForMcp(mcp, endpoint.healthUrl);
  } catch (error) {
    await stopProcess(mcp);
    throw error;
  }

  console.log(`[start] Obsidian MCP is healthy at ${endpoint.healthUrl}`);
  const gateway = spawnProcess([process.execPath, 'server.ts']);
  registerSignalHandlers([gateway, mcp]);

  const exit = await Promise.race([
    watchProcess('gateway', gateway),
    watchProcess('obsidian-mcp', mcp),
  ]);
  await stopProcesses([gateway, mcp], 'SIGTERM');
  return getExitCode(exit);
}

try {
  process.exitCode = await start();
} catch (error) {
  console.error(`[start] ${getErrorMessage(error)}`);
  process.exitCode = 1;
}
