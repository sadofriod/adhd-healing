import { withManagedRuntime, spawnManagedProcess, stopManagedProcess } from './runtime';

type ProcessName = 'gateway' | 'obsidian-mcp';
type ProcessExit = {
  readonly name: ProcessName;
  readonly code: number;
};

let requestedExitCode: number | undefined;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
type ManagedProcess = ReturnType<typeof Bun.spawn>;

async function stopProcesses(children: readonly ManagedProcess[], signal: NodeJS.Signals): Promise<void> {
  await Promise.all(children.map(child => stopManagedProcess(child, signal)));
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
  return withManagedRuntime(async ({ mcp }) => {
    const gateway = spawnManagedProcess([process.execPath, 'server.ts']);
    registerSignalHandlers([gateway, mcp]);

    const exit = await Promise.race([
      watchProcess('gateway', gateway),
      watchProcess('obsidian-mcp', mcp),
    ]);
    await stopProcesses([gateway], 'SIGTERM');
    return getExitCode(exit);
  });
}

try {
  process.exitCode = await start();
} catch (error) {
  console.error(`[start] ${getErrorMessage(error)}`);
  process.exitCode = 1;
}
