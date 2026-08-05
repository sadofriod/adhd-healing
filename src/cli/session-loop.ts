import type { DistillApiResponse, LlmActivityEvent, SessionHistoryItem } from '../types';
import {
  activateSession,
  listSessionHistory,
  resetSession,
  runWithSessionContext,
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
type SupportedCommandName = Exclude<CommandName, 'exit'>;
type CommandHandler = () => Promise<boolean>;

type ParsedCommand = {
  readonly name: CommandName;
  readonly argument?: string;
};

type SessionLoopState = {
  pendingResumeText?: string;
  sessionId?: string;
};

function getPendingResumeText(session: SessionHistoryItem | undefined): string | undefined {
  if (!session) return undefined;
  if (session.pendingTurn?.text) return session.pendingTurn.text;
  if (session.pendingTurnInput) return session.pendingTurnInput;
  return undefined;
}

const COMMAND_NAMES = ['new', 'continue', 'history', 'switch', 'help', 'exit'] as const satisfies readonly CommandName[];

function isCommandName(value: string | undefined): value is CommandName {
  if (!value) return false;
  return COMMAND_NAMES.includes(value as CommandName);
}

function buildParsedCommand(name: CommandName, argument: string): ParsedCommand {
  if (name === 'switch') return { name, argument };
  return { name };
}

function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith('/')) return null;
  const [rawName, ...rest] = input.slice(1).split(/\s+/);
  const name = rawName?.toLowerCase();
  if (!isCommandName(name)) return null;
  return buildParsedCommand(name, rest.join(' ').trim());
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

async function handleNewCommand(
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<boolean> {
  await deps.resetSession();
  state.pendingResumeText = undefined;
  state.sessionId = undefined;
  io.writeLine('Started a new session.');
  return false;
}

async function handleHistoryCommand(
  io: TerminalIo,
  deps: Required<LoopDeps>
): Promise<boolean> {
  await printHistory(io, deps.listSessionHistory);
  return false;
}

async function handleSwitchCommand(
  command: ParsedCommand,
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<boolean> {
  const sessions = await deps.listSessionHistory();
  const sessionId = selectSessionId(command.argument ?? '', sessions);
  if (!sessionId) {
    io.writeLine('Please provide a session id or history index, e.g. /switch 2');
    return false;
  }

  const switched = await switchSession(
    io,
    command.argument ?? '',
    deps.activateSession,
    async () => sessions
  );
  if (!switched) return false;

  state.pendingResumeText = getPendingResumeText(sessions.find(session => session.id === sessionId));
  state.sessionId = sessionId;
  return false;
}

async function handleContinueCommand(
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<boolean> {
  if (!state.pendingResumeText) {
    io.writeLine('No paused turn to continue.');
    return false;
  }

  const resumed = await deps.runDistill({
    text: state.pendingResumeText,
    reset: false,
    resume: true,
    sessionId: state.sessionId,
  }, event => reportActivity(io, event));
  printResult(io, resumed);
  state.sessionId = resumed.sessionId;
  state.pendingResumeText = resumed.status === 'PAUSED' ? state.pendingResumeText : undefined;
  return false;
}

function createCommandHandlers(
  command: ParsedCommand,
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Record<SupportedCommandName, CommandHandler> {
  return {
    help: async () => {
      printHelp(io);
      return false;
    },
    new: async () => handleNewCommand(io, state, deps),
    history: async () => handleHistoryCommand(io, deps),
    switch: async () => handleSwitchCommand(command, io, state, deps),
    continue: async () => handleContinueCommand(io, state, deps),
  };
}

async function handleCommand(
  command: ParsedCommand,
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<boolean> {
  if (command.name === 'exit') return true;
  return createCommandHandlers(command, io, state, deps)[command.name]();
}

async function runInitialMode(
  options: SessionLoopOptions,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<void> {
  if (options.startNewSession) {
    await deps.resetSession();
  }

  if (!options.sessionId) return;
  const switched = await deps.activateSession(options.sessionId);
  if (!switched) throw new Error(`Session not found: ${options.sessionId}`);
  const sessions = await deps.listSessionHistory();
  state.pendingResumeText = getPendingResumeText(
    sessions.find(session => session.id === options.sessionId)
  );
}

async function handleUserTurn(
  input: string,
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<void> {
  const result = await deps.runDistill({
    text: input,
    reset: false,
    sessionId: state.sessionId,
  }, event => reportActivity(io, event));
  printResult(io, result);
  state.sessionId = result.sessionId;
  state.pendingResumeText = result.status === 'PAUSED' ? input : undefined;
}

async function processLoopInput(
  input: string,
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<boolean> {
  const command = parseCommand(input);
  if (command) return handleCommand(command, io, state, deps);
  await handleUserTurn(input, io, state, deps);
  return false;
}

async function runInteractiveLoop(
  io: TerminalIo,
  state: SessionLoopState,
  deps: Required<LoopDeps>
): Promise<void> {
  for (;;) {
    const input = normalizeTerminalInput(await io.readLine('you> '));
    if (!input) continue;
    if (await processLoopInput(input, io, state, deps)) return;
  }
}

export async function runSessionLoop(
  options: SessionLoopOptions,
  deps: LoopDeps = {}
): Promise<void> {
  return runWithSessionContext(async () => {
    const resolvedDeps: Required<LoopDeps> = {
      activateSession: deps.activateSession ?? activateSession,
      listSessionHistory: deps.listSessionHistory ?? listSessionHistory,
      resetSession: deps.resetSession ?? resetSession,
      runDistill: deps.runDistill ?? runDistillOrchestration,
    };
    const state: SessionLoopState = { sessionId: options.sessionId };
    await runInitialMode(options, state, resolvedDeps);

    options.io.writeLine('CLI session started. Type /help for commands.');
    await runInteractiveLoop(options.io, state, resolvedDeps);
  });
}

export function parseSessionLoopCommand(input: string): ParsedCommand | null {
  return parseCommand(input);
}
