import { spawnSync } from 'child_process';
import { access, mkdir, writeFile } from 'fs/promises';
import { constants } from 'fs';
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

async function isCliAvailable(cliCommand: string): Promise<boolean> {
  if (/[\\/]/.test(cliCommand)) {
    try {
      await access(cliCommand, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  return Bun.which(cliCommand) !== null;
}

function buildCliUnavailableError(cliCommand: string): Error {
  return new Error(
    `[obsidian] CLI command not found: "${cliCommand}". Install Obsidian CLI from https://obsidian.md/cli, enable Command line interface in Obsidian, and register it in PATH.`
  );
}

export async function ensureObsidianCliAvailable(cliCommand: string = config.obsidianCliCommand): Promise<void> {
  if (await isCliAvailable(cliCommand)) return;
  throw buildCliUnavailableError(cliCommand);
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
  const cliCommand = options.cliCommand ?? config.obsidianCliCommand;
  await ensureObsidianCliAvailable(cliCommand);
  const absolutePath = await writeNoteFile(relativePath, content, vaultPath);
  const cliArgs = resolveCliArgs(
    options.cliArgs ?? config.obsidianCliArgs,
    absolutePath,
    relativePath,
    content,
    vaultPath
  );
  const cliWorkingDirectory = dirname(absolutePath);

  const result = spawnSync(cliCommand, cliArgs, {
    cwd: cliWorkingDirectory,
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

async function writeWithCliMode(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions,
  vaultPath: string
): Promise<ObsidianWriteResult> {
  const cliCommand = options.cliCommand ?? config.obsidianCliCommand;
  await ensureObsidianCliAvailable(cliCommand);
  return writeWithSelectedBackend(relativePath, content, options, vaultPath, 'cli');
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

export async function writeObsidianNote(
  relativePath: string,
  content: string,
  options: ObsidianWriteOptions = {}
): Promise<ObsidianWriteResult> {
  const vaultPath = options.vaultPath ?? config.obsidianVaultPath;
  const backend = options.backend ?? config.obsidianWriteBackend;
  const backendHandlers: Record<ObsidianWriteBackend, (relativePath: string, content: string, options: ObsidianWriteOptions, vaultPath: string) => Promise<ObsidianWriteResult>> = {
    auto: (nextRelativePath, nextContent, nextOptions, nextVaultPath) => writeWithCliMode(nextRelativePath, nextContent, nextOptions, nextVaultPath),
    cli: (nextRelativePath, nextContent, nextOptions, nextVaultPath) => writeWithFixedBackend(nextRelativePath, nextContent, nextOptions, nextVaultPath, 'cli'),
    mcp: (nextRelativePath, nextContent, nextOptions, nextVaultPath) => writeWithFixedBackend(nextRelativePath, nextContent, nextOptions, nextVaultPath, 'mcp'),
  };

  return backendHandlers[backend](relativePath, content, options, vaultPath);
}
