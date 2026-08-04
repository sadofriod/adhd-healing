export type CliOptions = {
  readonly help: boolean;
  readonly startNewSession: boolean;
  readonly sessionId?: string;
};

const HELP_FLAGS = new Set(['-h', '--help']);

type ArgCursor = {
  readonly args: readonly string[];
  index: number;
};

function takeNextValue(cursor: ArgCursor, flag: string): string {
  const nextValue = cursor.args[cursor.index + 1];
  if (!nextValue || nextValue.startsWith('-')) {
    throw new Error(`Missing value for ${flag}`);
  }
  cursor.index += 1;
  return nextValue;
}

function applyFlag(option: string, cursor: ArgCursor, current: CliOptions): CliOptions {
  if (HELP_FLAGS.has(option)) {
    return { ...current, help: true };
  }

  if (option === '--new') {
    return { ...current, startNewSession: true };
  }

  if (option === '--session') {
    return { ...current, sessionId: takeNextValue(cursor, option) };
  }

  throw new Error(`Unknown option: ${option}`);
}

function assertOptionConflict(options: CliOptions): void {
  if (options.startNewSession && options.sessionId) {
    throw new Error('Cannot combine --new with --session');
  }
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  const cursor: ArgCursor = {
    args,
    index: 0,
  };
  let options: CliOptions = {
    help: false,
    startNewSession: false,
  };

  while (cursor.index < cursor.args.length) {
    options = applyFlag(cursor.args[cursor.index] ?? '', cursor, options);
    cursor.index += 1;
  }

  assertOptionConflict(options);
  return options;
}

export function buildCliUsage(): string {
  return [
    'Usage: pnpm run start:cli -- [options]',
    '',
    'Options:',
    '  -h, --help        Show help',
    '  --new             Start with a new session',
    '  --session <id>    Activate a specific history session before chatting',
    '',
    'In-chat commands:',
    '  /new              Start a new session',
    '  /continue         Resume the paused turn in current session',
    '  /history          List history sessions',
    '  /switch <id|n>    Switch to a history session by id or list index',
    '  /help             Show in-chat help',
    '  /exit             Exit CLI mode',
  ].join('\n');
}
