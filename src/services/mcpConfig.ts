import { readFile } from 'fs/promises';
import { z } from 'zod';

const ENV_REFERENCE_PATTERN = /^\$\{env:([A-Z][A-Z0-9_]*)\}$/;

const StdioServerSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  cwd: z.string().trim().min(1).optional(),
  exposeToModel: z.boolean().default(true),
});

const SseServerSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
  headers: z.record(z.string()).default({}),
  exposeToModel: z.boolean().default(true),
});

const McpConfigSchema = z.object({
  servers: z.record(z.discriminatedUnion('type', [StdioServerSchema, SseServerSchema])),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;

export function parseMcpConfig(rawConfig: unknown): McpConfig {
  return McpConfigSchema.parse(rawConfig);
}

function getRequiredEnvironmentValue(
  name: string,
  runtimeEnv: Readonly<Record<string, string | undefined>>
): string {
  const resolvedValue = runtimeEnv[name];
  if (!resolvedValue) throw new Error(`Missing environment variable ${name} for MCP server`);
  return resolvedValue;
}

function resolveEnvironmentValue(
  value: string,
  runtimeEnv: Readonly<Record<string, string | undefined>>
): string {
  const referenceMatch = value.match(ENV_REFERENCE_PATTERN);
  if (!referenceMatch) return value;
  return getRequiredEnvironmentValue(referenceMatch[1], runtimeEnv);
}

export function resolveMcpEnvironment(
  configuredEnv: Readonly<Record<string, string>>,
  runtimeEnv: Readonly<Record<string, string | undefined>>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(configuredEnv).map(([name, value]) => [
      name,
      resolveEnvironmentValue(value, runtimeEnv),
    ])
  );
}

export async function loadMcpConfig(configPath: string): Promise<McpConfig> {
  return parseMcpConfig(JSON.parse(await readFile(configPath, 'utf8')));
}
