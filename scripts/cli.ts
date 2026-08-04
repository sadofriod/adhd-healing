import { closeMcpServers } from '../src/services/mcp';
import { verifyStartupDependencies } from '../src/services/startup';
import { buildCliUsage, parseCliOptions } from '../src/cli/args';
import { createTerminalIo } from '../src/cli/terminal-io';
import { runSessionLoop } from '../src/cli/session-loop';
import { withManagedRuntime } from './runtime';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runCliFromArgs(rawArgs: readonly string[]): Promise<number> {
  const options = parseCliOptions(rawArgs);
  if (options.help) {
    console.log(buildCliUsage());
    return 0;
  }

  return withManagedRuntime(async () => {
    await verifyStartupDependencies();
    const io = createTerminalIo();

    try {
      await runSessionLoop({
        io,
        sessionId: options.sessionId,
        startNewSession: options.startNewSession,
      });
      return 0;
    } finally {
      io.close();
      await closeMcpServers();
    }
  });
}

try {
  process.exitCode = await runCliFromArgs(Bun.argv.slice(2));
} catch (error) {
  console.error(`[cli] ${getErrorMessage(error)}`);
  process.exitCode = 1;
}
