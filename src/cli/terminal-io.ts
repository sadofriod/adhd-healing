import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';

export type TerminalIo = {
  readonly readLine: (prompt: string) => Promise<string>;
  readonly writeLine: (line: string) => void;
  readonly close: () => void;
};

export function normalizeTerminalInput(input: string): string {
  return input.trim();
}

export function createTerminalIo(): TerminalIo {
  const readline = createInterface({
    input: stdin,
    output: stdout,
    terminal: true,
  });

  return {
    readLine: prompt => readline.question(prompt),
    writeLine: line => {
      stdout.write(`${line}\n`);
    },
    close: () => readline.close(),
  };
}
