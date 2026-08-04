import { z } from 'zod';
import { isAbsolute, resolve } from 'path';

function parseCliArgs(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  const parsed = tryParseCliArgs(trimmed);
  if (parsed) return parsed;
  return trimmed.split(/\s+/).filter(Boolean);
}

function tryParseCliArgs(rawValue: string): string[] | undefined {
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    }
  } catch {
    return undefined;
  }

  return undefined;
}

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().trim().min(1),
  BRAIN_VAULT_PATH: z.string().trim().min(1).refine(isAbsolute, {
    message: 'must be an absolute path',
  }),
  PORT: z.coerce.number().int().positive().max(65535).default(5001),
  MCP_CONFIG_PATH: z.string().trim().min(1).default(resolve(process.cwd(), 'mcp.json')),
  OBSIDIAN_MCP_WRITE_TOOL: z.string().trim().min(1).default('obsidian_create-note'),
  OBSIDIAN_NOTE_FOLDER: z.string().trim().min(1).default('Brainstorm').refine(
    value => !isAbsolute(value) && !value.split(/[\\/]/).includes('..'),
    { message: 'must be a vault-relative folder without parent traversal' }
  ),
  OBSIDIAN_WRITE_BACKEND: z.enum(['cli', 'mcp', 'auto']).default('auto'),
  OBSIDIAN_CLI_COMMAND: z.string().trim().min(1).default('obsidian'),
  OBSIDIAN_CLI_ARGS: z.string().trim().default('{path}'),
});

function formatIssuePath(path: (string | number)[]): string {
  if (path.length === 0) return 'env';
  return path.join('.');
}

function failInvalidEnv(error: z.ZodError): never {
  console.error('[config] Invalid environment variables:');
  error.issues.forEach(issue => {
    console.error(`- ${formatIssuePath(issue.path)}: ${issue.message}`);
  });
  throw new Error('Invalid environment variables');
}

const parsedEnv = envSchema.safeParse(Bun.env);
const env = parsedEnv.success ? parsedEnv.data : failInvalidEnv(parsedEnv.error);

export const config = {
  deepseekApiKey: env.DEEPSEEK_API_KEY,
  brainVaultPath: env.BRAIN_VAULT_PATH,
  port: env.PORT,
  mcpConfigPath: env.MCP_CONFIG_PATH,
  obsidianMcpWriteTool: env.OBSIDIAN_MCP_WRITE_TOOL,
  obsidianNoteFolder: env.OBSIDIAN_NOTE_FOLDER,
  obsidianVaultPath: resolve(env.BRAIN_VAULT_PATH, env.OBSIDIAN_NOTE_FOLDER),
  obsidianWriteBackend: env.OBSIDIAN_WRITE_BACKEND,
  obsidianCliCommand: env.OBSIDIAN_CLI_COMMAND,
  obsidianCliArgs: parseCliArgs(env.OBSIDIAN_CLI_ARGS),
};
