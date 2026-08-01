import { readFile } from 'fs/promises';
import { experimental_createMCPClient, type ToolSet } from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { z } from 'zod';

const ENV_REFERENCE_PATTERN = /^\$\{env:([A-Z][A-Z0-9_]*)\}$/;

const StdioServerSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  cwd: z.string().trim().min(1).optional(),
});

const McpConfigSchema = z.object({
  servers: z.record(StdioServerSchema),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;
type McpClient = Awaited<ReturnType<typeof experimental_createMCPClient>>;

let clients: readonly McpClient[] = [];
let tools: ToolSet = {};

export function parseMcpConfig(rawConfig: unknown): McpConfig {
  return McpConfigSchema.parse(rawConfig);
}

function resolveEnvironmentValue(
  value: string,
  runtimeEnv: Readonly<Record<string, string | undefined>>
): string {
  const referenceMatch = value.match(ENV_REFERENCE_PATTERN);
  if (!referenceMatch) return value;
  return getRequiredEnvironmentValue(referenceMatch[1], runtimeEnv);
}

function getRequiredEnvironmentValue(
  name: string,
  runtimeEnv: Readonly<Record<string, string | undefined>>
): string {
  const resolvedValue = runtimeEnv[name];
  if (!resolvedValue) throw new Error(`Missing environment variable ${name} for MCP server`);
  return resolvedValue;
}

export function resolveMcpEnvironment(
  configuredEnv: Readonly<Record<string, string>>,
  runtimeEnv: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(configuredEnv).map(([name, value]) => [name, resolveEnvironmentValue(value, runtimeEnv)])
  );
}

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

async function connectServer(
  serverName: string,
  server: McpConfig['servers'][string]
): Promise<{ readonly client: McpClient; readonly tools: ToolSet }> {
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
  const serverTools = await client.tools();
  return { client, tools: prefixTools(serverName, serverTools) };
}

export async function initializeMcpServers(configPath: string): Promise<void> {
  const config = parseMcpConfig(JSON.parse(await readFile(configPath, 'utf8')));
  const connections = await Promise.all(
    Object.entries(config.servers).map(([serverName, server]) => connectServer(serverName, server))
  );
  clients = connections.map(connection => connection.client);
  tools = Object.assign({}, ...connections.map(connection => connection.tools));
  console.log(`[mcp] Loaded ${Object.keys(tools).length} tools from ${connections.length} server(s).`);
}

export function getMcpTools(): ToolSet {
  return tools;
}

export async function closeMcpServers(): Promise<void> {
  await Promise.allSettled(clients.map(client => client.close()));
  clients = [];
  tools = {};
}