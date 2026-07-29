function assertEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  databaseUrl: assertEnvVar('DATABASE_URL'),
  brainVaultPath: assertEnvVar('BRAIN_VAULT_PATH'),
  lmStudioBaseUrl: getOptionalEnvVar('LM_STUDIO_BASE_URL', 'http://localhost:1234/v1'),
  embeddingModel: getOptionalEnvVar('EMBEDDING_MODEL', 'nomic-ai/nomic-embed-text-v1.5'),
  chatModel: getOptionalEnvVar('CHAT_MODEL', 'qwen2.5-7b-instruct'),
  maxClarificationTurns: Number(getOptionalEnvVar('MAX_CLARIFICATION_TURNS', '3')),
  port: Number(getOptionalEnvVar('PORT', '5001')),
};
