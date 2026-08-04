import { spawnSync } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { config } from '../config/env';
import { executeMcpTool } from './mcp';
import type { McpToolExecutor } from './obsidian';

export type ObsidianWriteBackend = 'cli' | 'mcp' | 'auto';
export type ObsidianWriteMode = Exclude<ObsidianWriteBackend, 'auto'>;

export type ObsidianWriteResult = {
  readonly backend: ObsidianWriteMode;
  readonly path: string;
};

export type ObsidianWriteOptions = {
  readonly executeTool?: McpToolExecutor;
  readonly backend?: ObsidianWriteBackend;
  readonly cliCommand?: string;
  readonly cliArgs?: readonly string[];
  readonly vaultPath?: string;
};

function resolveCliArgs(
  templateArgs: readonly string[],
  absolutePath: string,
  relativePath: string,
  content: string,
  vaultPath: string
): string[] {
  return templateArgs.map(arg => arg
    .replaceAll('{path}', absolutePath)
    .replaceAll('{relativePath}', relativePath)
    .replaceAll('{content}', content)
    .replaceAll('{vault}', vaultPath));
}

async function writeNoteFile(
  relativePath: string,
  content: string,
  vaultPath: string
): Promise<string> {
  const absolutePath = resolve(vaultPath, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
  return absolutePath;
}

// eslint-disable-next-line complexity
function assertCliResult(result: ReturnType<typeof spawnSync>): void {
  const error = result.error;
  const status = result.status ?? 0;

  if (!error && status === 0) return;
  if (error) throw error;
  throw new Error(`Obsidian CLI exited with code ${status}: ${result.stderr || result.stdout}`.trim());
}

async function writeWithCli(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions,
  vaultPath: string
): Promise<void> {
  const absolutePath = await writeNoteFile(relativePath, content, vaultPath);
  const cliCommand = options.cliCommand ?? config.obsidianCliCommand;
  const cliArgs = resolveCliArgs(
    options.cliArgs ?? config.obsidianCliArgs,
    absolutePath,
    relativePath,
    content,
    vaultPath
  );

  const result = spawnSync(cliCommand, cliArgs, {
    cwd: vaultPath,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  assertCliResult(result);
}

async function writeWithMcp(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions
): Promise<void> {
  const execute = options.executeTool ?? executeMcpTool;
  await execute(config.obsidianMcpWriteTool, {
    path: relativePath,
    content,
  });
}

async function writeWithSelectedBackend(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions,
  vaultPath: string,
  backend: ObsidianWriteBackend
): Promise<ObsidianWriteResult> {
  if (backend === 'cli') {
    await writeWithCli(relativePath, content, options, vaultPath);
    return { backend: 'cli', path: relativePath };
  }

  await writeWithMcp(relativePath, content, options);
  return { backend: 'mcp', path: relativePath };
}

async function writeWithAutoFallback(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions,
  vaultPath: string
): Promise<ObsidianWriteResult> {
  try {
    return await writeWithSelectedBackend(relativePath, content, options, vaultPath, 'cli');
  } catch (error) {
    console.warn('[obsidian] CLI write failed, falling back to MCP:', error);
    return writeWithSelectedBackend(relativePath, content, options, vaultPath, 'mcp');
  }
}

async function writeWithFixedBackend(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions,
  vaultPath: string,
  backend: Exclude<ObsidianWriteBackend, 'auto'>
): Promise<ObsidianWriteResult> {
  return writeWithSelectedBackend(relativePath, content, options, vaultPath, backend);
}

// eslint-disable-next-line complexity
export async function writeObsidianNote(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions = {}
): Promise<ObsidianWriteResult> {
  const vaultPath = options.vaultPath ?? config.obsidianVaultPath;
  const backend = options.backend ?? config.obsidianWriteBackend;
  const backendHandlers: Record<ObsidianWriteBackend, (relativePath: string, content: string, options: ObsidianWriteOptions, vaultPath: string) => Promise<ObsidianWriteResult>> = {
    auto: (nextRelativePath, nextContent, nextOptions, nextVaultPath) => writeWithAutoFallback(nextRelativePath, nextContent, nextOptions, nextVaultPath),
    cli: (nextRelativePath, nextContent, nextOptions, nextVaultPath) => writeWithFixedBackend(nextRelativePath, nextContent, nextOptions, nextVaultPath, 'cli'),
    mcp: (nextRelativePath, nextContent, nextOptions, nextVaultPath) => writeWithFixedBackend(nextRelativePath, nextContent, nextOptions, nextVaultPath, 'mcp'),
  };

  return backendHandlers[backend](relativePath, content, options, vaultPath);
}
