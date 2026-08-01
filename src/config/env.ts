import { z } from 'zod';
import { isAbsolute, resolve } from 'path';

const envSchema = z.object({
  DEEPSEEK_API_KEY: z.string().trim().min(1),
  BRAIN_VAULT_PATH: z.string().trim().min(1).refine(isAbsolute, {
    message: 'must be an absolute path',
  }),
  PORT: z.coerce.number().int().positive().max(65535).default(5001),
  MCP_CONFIG_PATH: z.string().trim().min(1).default(resolve(process.cwd(), 'mcp.json')),
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
};

