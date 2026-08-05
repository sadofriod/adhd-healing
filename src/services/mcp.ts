import { experimental_createMCPClient, type ToolSet } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { config as appConfig } from '../config/env';
import {
  loadMcpConfig,
  resolveMcpEnvironment,
  type McpConfig,
} from './mcpConfig';
import { buildFilesystemServerConfig, filterFilesystemReadTools } from './filesystem-mcp';

type McpClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

const DIRECT_MCP_TIMEOUT_MS = 30_000;

let clients: readonly McpClient[] = [];
let tools: ToolSet = {};
let directTools: ToolSet = {};

function compactEnvironment(
  environment: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );
}

function prefixTools(serverName: string, serverTools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(serverTools).map(([toolName, serverTool]) => [
      `${serverName}_${toolName}`,
      wrapMcpTool(`${serverName}_${toolName}`, serverTool),
    ])
  );
}

function prefixDirectTools(serverName: string, serverTools: ToolSet): ToolSet {
  return Object.fromEntries(
    Object.entries(serverTools).map(([toolName, serverTool]) => [
      `${serverName}_${toolName}`,
      serverTool,
    ])
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function wrapMcpTool(toolName: string, mcpTool: ToolSet[string]): ToolSet[string] {
  if (!mcpTool.execute) return mcpTool;

  const execute = mcpTool.execute;
  return {
    ...mcpTool,
    execute: async (args, options) => {
      try {
        return await execute(args, options);
      } catch (error) {
        if (isAborted(options.abortSignal)) throw error;

        const message = getErrorMessage(error);
        console.warn(`[mcp] Tool ${toolName} failed: ${message}`);
        return {
          ok: false,
          error: message,
        };
      }
    },
  };
}

export function makeMcpToolsResilient(serverName: string, serverTools: ToolSet): ToolSet {
  return prefixTools(serverName, serverTools);
}

function getConfiguredServers(configuredServers: McpConfig['servers']): McpConfig['servers'] {
  const filesystemServer = buildFilesystemServerConfig(appConfig.filesystemMcpAllowedDirs);
  if (!filesystemServer) return configuredServers;

  return {
    ...configuredServers,
    filesystem: filesystemServer,
  };
}

function filterServerTools(serverName: string, serverTools: ToolSet): ToolSet {
  if (serverName !== 'filesystem') return serverTools;
  return filterFilesystemReadTools(serverTools);
}

async function connectServer(
  serverName: string,
  server: McpConfig['servers'][string]
): Promise<{
  readonly client: McpClient;
  readonly tools: ToolSet;
  readonly directTools: ToolSet;
}> {
  if (server.type === 'sse') return connectSseServer(serverName, server);

  const transport = new Experimental_StdioMCPTransport({
    command: server.command,
    args: server.args,
    env: {
      ...compactEnvironment(process.env),
      ...resolveMcpEnvironment(server.env, process.env),
    },
    stderr: 'inherit',
    cwd: server.cwd,
  });
  const client = await experimental_createMCPClient({ name: `adhd-healing-${serverName}`, transport });
  const serverTools = filterServerTools(serverName, await client.tools());
  return buildServerConnection(serverName, client, serverTools, server.exposeToModel);
}

async function connectSseServer(
  serverName: string,
  server: Extract<McpConfig['servers'][string], { type: 'sse' }>
): Promise<{
  readonly client: McpClient;
  readonly tools: ToolSet;
  readonly directTools: ToolSet;
}> {
  const client = await experimental_createMCPClient({
    name: `adhd-healing-${serverName}`,
    transport: {
      type: 'sse',
      url: server.url,
      headers: resolveMcpEnvironment(server.headers, process.env),
    },
  });
  const serverTools = await client.tools();
  return buildServerConnection(serverName, client, serverTools, server.exposeToModel);
}

function buildServerConnection(
  serverName: string,
  client: McpClient,
  serverTools: ToolSet,
  exposeToModel: boolean
): {
  readonly client: McpClient;
  readonly tools: ToolSet;
  readonly directTools: ToolSet;
} {
  return {
    client,
    tools: exposeToModel ? prefixTools(serverName, serverTools) : {},
    directTools: prefixDirectTools(serverName, serverTools),
  };
}

export async function initializeMcpServers(configPath: string): Promise<void> {
  const config = await loadMcpConfig(configPath);
  const configuredServers = getConfiguredServers(config.servers);
  const attempts = await Promise.allSettled(
    Object.entries(configuredServers).map(async ([serverName, server]) => ({
      serverName,
      connection: await connectServer(serverName, server),
    }))
  );

  const successes = attempts
    .filter((attempt): attempt is PromiseFulfilledResult<{
      readonly serverName: string;
      readonly connection: {
        readonly client: McpClient;
        readonly tools: ToolSet;
        readonly directTools: ToolSet;
      };
    }> => attempt.status === 'fulfilled')
    .map(attempt => attempt.value);

  attempts.forEach((attempt, index) => {
    if (attempt.status === 'fulfilled') return;
    const serverName = Object.keys(configuredServers)[index];
    console.warn(`[mcp] Failed to connect server ${serverName}: ${getErrorMessage(attempt.reason)}`);
  });

  if (successes.length === 0) {
    throw new Error('Failed to initialize all MCP servers');
  }

  const connections = successes.map(success => success.connection);
  clients = connections.map(connection => connection.client);
  tools = Object.assign({}, ...connections.map(connection => connection.tools));
  directTools = Object.assign({}, ...connections.map(connection => connection.directTools));
  console.log(
    `[mcp] Loaded ${Object.keys(tools).length} tools from ${connections.length}/${Object.keys(configuredServers).length} server(s).`
  );
}

export function getMcpTools(): ToolSet {
  return tools;
}

function hasErrorFlag(result: object): boolean {
  return 'isError' in result && result.isError === true;
}

function hasFailureStatus(result: object): boolean {
  return 'ok' in result && result.ok === false;
}

function isObjectResult(result: unknown): result is object {
  return typeof result === 'object' && result !== null;
}

function isFailedToolResult(result: unknown): boolean {
  if (!isObjectResult(result)) return false;
  return hasErrorFlag(result) || hasFailureStatus(result);
}

function getToolExecutor(toolName: string): NonNullable<ToolSet[string]['execute']> {
  const execute = directTools[toolName]?.execute;
  if (!execute) throw new Error(`MCP tool is unavailable: ${toolName}`);
  return execute;
}

function assertSuccessfulToolResult(toolName: string, result: unknown): void {
  if (isFailedToolResult(result)) throw new Error(`MCP tool failed: ${toolName}`);
}

export async function executeMcpOperation<Result>(
  toolName: string,
  operation: (abortSignal: AbortSignal) => Promise<Result>,
  timeoutMs: number = DIRECT_MCP_TIMEOUT_MS
): Promise<Result> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`MCP tool timed out after ${timeoutMs}ms: ${toolName}`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutResult]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const execute = getToolExecutor(toolName);
  const result = await executeMcpOperation(toolName, abortSignal => Promise.resolve(execute(args, {
    toolCallId: `direct-${crypto.randomUUID()}`,
    messages: [],
    abortSignal,
  })));
  assertSuccessfulToolResult(toolName, result);
  return result;
}

export async function closeMcpServers(): Promise<void> {
  await Promise.allSettled(clients.map(client => client.close()));
  clients = [];
  tools = {};
  directTools = {};
}