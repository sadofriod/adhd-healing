import { z } from 'zod';
import { isAbsolute } from 'path';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BRAIN_VAULT_PATH: z.string().trim().min(1).refine(isAbsolute, {
    message: 'must be an absolute path',
  }),
  LM_STUDIO_BASE_URL: z.string().url().default('http://localhost:1234/v1'),
  EMBEDDING_MODEL: z.string().trim().min(1).default('nomic-ai/nomic-embed-text-v1.5'),
  CHAT_MODEL: z.string().trim().min(1).default('qwen2.5-7b-instruct'),
  MAX_CLARIFICATION_TURNS: z.coerce.number().int().positive().default(3),
  PORT: z.coerce.number().int().positive().max(65535).default(5001),
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
  databaseUrl: env.DATABASE_URL,
  brainVaultPath: env.BRAIN_VAULT_PATH,
  lmStudioBaseUrl: env.LM_STUDIO_BASE_URL,
  embeddingModel: env.EMBEDDING_MODEL,
  chatModel: env.CHAT_MODEL,
  maxClarificationTurns: env.MAX_CLARIFICATION_TURNS,
  port: env.PORT,
};
