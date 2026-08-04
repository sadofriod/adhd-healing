import type { DistillApiResponse, LlmActivityEvent, SessionHistoryItem } from '../types';
import {
  activateSession,
  listSessionHistory,
  resetSession,
} from '../services/session';
import { runDistillOrchestration } from '../services/distill-orchestration';
import type { TerminalIo } from './terminal-io';
import { normalizeTerminalInput } from './terminal-io';

type LoopDeps = {
  readonly activateSession?: typeof activateSession;
  readonly listSessionHistory?: typeof listSessionHistory;
  readonly resetSession?: typeof resetSession;
  readonly runDistill?: typeof runDistillOrchestration;
};

export type SessionLoopOptions = {
  readonly io: TerminalIo;
  readonly startNewSession?: boolean;
  readonly sessionId?: string;
};

type CommandName = 'new' | 'continue' | 'history' | 'switch' | 'help' | 'exit';

type ParsedCommand = {
  readonly name: CommandName;
  readonly argument?: string;
};

type SessionLoopState = {
  pendingResumeText?: string;
};

function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null;
  const [rawName, ...rest] = input.slice(1).split(/\s+/);
  const name = rawName?.toLowerCase();
  const argument = rest.join(' ').trim();

  if (name === 'new') return { name: 'new' };
  if (name === 'continue') return { name: 'continue' };
  if (name === 'history') return { name: 'history' };
  if (name === 'switch') return { name: 'switch', argument };
  if (name === 'help') return { name: 'help' };
  if (name === 'exit') return { name: 'exit' };
  return null;
}

function getShortId(id: string): string {
  return id.slice(0, 8);
}

function formatHistoryLine(session: SessionHistoryItem, index: number): string {
  return `${index + 1}. [${session.status}] ${getShortId(session.id)} ${session.title}`;
}

function selectSessionId(argument: string, sessions: readonly SessionHistoryItem[]): string | undefined {
  if (!argument) return undefined;
  const parsedIndex = Number(argument);
  if (!Number.isNaN(parsedIndex) && Number.isInteger(parsedIndex)) {
    const session = sessions[parsedIndex - 1];
    return session?.id;
  }
  return argument;
}

function reportActivity(io: TerminalIo, event: LlmActivityEvent): void {
  if (event.type === 'usage') {
    io.writeLine(
      `[usage] ${event.source}: input ${event.usage.inputTokens} / output ${event.usage.outputTokens} / total ${event.usage.totalTokens}`
    );
    return;
  }
  io.writeLine(`[progress:${event.phase}] ${event.message}`);
}

function printResult(io: TerminalIo, result: DistillApiResponse): void {
  io.writeLine('');
  io.writeLine('assistant>');
  io.writeLine(result.text);
  io.writeLine('');
}

function printHelp(io: TerminalIo): void {
  io.writeLine('Commands: /new /continue /history /switch <id|n> /help /exit');
}

async function switchSession(
  io: TerminalIo,
  argument: string,
  activate: typeof activateSession,
  listHistory: typeof listSessionHistory
): Promise<boolean> {
  const sessions = await listHistory();
  const sessionId = selectSessionId(argument, sessions);
  if (!sessionId) {
    io.writeLine('Please provide a session id or history index, e.g. /switch 2');
    return false;
  }

  const switched = await activate(sessionId);
  if (!switched) {
    io.writeLine(`Session not found: ${sessionId}`);
    return false;
  }

  io.writeLine(`Switched to session: ${sessionId}`);
  return true;
}

async function printHistory(io: TerminalIo, listHistory: typeof listSessionHistory): Promise<void> {
  const sessions = await listHistory();
  if (sessions.length === 0) {
    io.writeLine('No session history yet.');
    return;
  }
  io.writeLine('History sessions:');
  sessions.forEach((session, index) => {
    io.writeLine(formatHistoryLine(session, index));
  });
}

async function handleCommand(
  command: ParsedCommand,
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<boolean> {
  if (command.name === 'exit') return true;

  if (command.name === 'help') {
    printHelp(io);
    return false;
  }

  if (command.name === 'new') {
    await deps.resetSession();
    state.pendingResumeText = undefined;
    io.writeLine('Started a new session.');
    return false;
  }

  if (command.name === 'history') {
    await printHistory(io, deps.listSessionHistory);
    return false;
  }

  if (command.name === 'switch') {
    const switched = await switchSession(
      io,
      command.argument ?? '',
      deps.activateSession,
      deps.listSessionHistory
    );
    if (switched) state.pendingResumeText = undefined;
    return false;
  }

  if (!state.pendingResumeText) {
    io.writeLine('No paused turn to continue.');
    return false;
  }

  const resumed = await deps.runDistill({
    text: state.pendingResumeText,
    reset: false,
    resume: true,
  }, event => reportActivity(io, event));
  printResult(io, resumed);
  state.pendingResumeText = resumed.status === 'PAUSED' ? state.pendingResumeText : undefined;
  return false;
}

async function runInitialMode(options: SessionLoopOptions, deps: Required<LoopDeps>): Promise<void> {
  if (options.startNewSession) {
    await deps.resetSession();
  }

  if (!options.sessionId) return;
  const switched = await deps.activateSession(options.sessionId);
  if (!switched) throw new Error(`Session not found: ${options.sessionId}`);
}

export async function runSessionLoop(
  options: SessionLoopOptions,
  deps: LoopDeps = {}
): Promise<void> {
  const resolvedDeps: Required<LoopDeps> = {
    activateSession: deps.activateSession ?? activateSession,
    listSessionHistory: deps.listSessionHistory ?? listSessionHistory,
    resetSession: deps.resetSession ?? resetSession,
    runDistill: deps.runDistill ?? runDistillOrchestration,
  };
  const state: SessionLoopState = {};
  await runInitialMode(options, resolvedDeps);

  options.io.writeLine('CLI session started. Type /help for commands.');

  for (;;) {
    const input = normalizeTerminalInput(await options.io.readLine('you> '));
    if (!input) continue;

    const command = parseCommand(input);
    if (command) {
      const shouldExit = await handleCommand(command, options.io, state, resolvedDeps);
      if (shouldExit) return;
      continue;
    }

    const result = await resolvedDeps.runDistill({ text: input, reset: false }, event => reportActivity(options.io, event));
    printResult(options.io, result);
    state.pendingResumeText = result.status === 'PAUSED' ? input : undefined;
  }
}

export function parseSessionLoopCommand(input: string): ParsedCommand | null {
  return parseCommand(input);
}
