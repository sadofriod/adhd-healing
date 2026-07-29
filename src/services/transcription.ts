import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const HELPER_SOURCE_PATH = fileURLToPath(new URL('./mac-transcribe.swift', import.meta.url));
const HELPER_INFO_PLIST_PATH = fileURLToPath(
  new URL('./mac-transcribe-Info.plist', import.meta.url)
);
const HELPER_DIRECTORY = join(tmpdir(), 'adhd-healing');
const HELPER_BUNDLE_PATH = join(HELPER_DIRECTORY, 'mac-transcribe.app');
const HELPER_CONTENTS_PATH = join(HELPER_BUNDLE_PATH, 'Contents');
const HELPER_MACOS_PATH = join(HELPER_CONTENTS_PATH, 'MacOS');
const HELPER_BINARY_PATH = join(HELPER_MACOS_PATH, 'mac-transcribe');
const HELPER_BUNDLE_INFO_PLIST_PATH = join(HELPER_CONTENTS_PATH, 'Info.plist');
const DEFAULT_AUDIO_EXTENSION = '.m4a';
const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'audio/m4a': '.m4a',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-m4a': '.m4a',
  'audio/x-wav': '.wav',
};

type HelperCheckPayload = {
  status: 'ok';
  locale: string;
};

type HelperTranscriptionPayload = {
  text: string;
};

type HelperErrorPayload = {
  error: string;
};

type HelperCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type TranscriptionOptions = {
  fileName?: string;
  mimeType?: string;
};

let helperBundlePromise: Promise<string> | null = null;

function normalizeCommandOutput(output: string): string {
  return output.trim();
}

async function readStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return '';
  return normalizeCommandOutput(await new Response(stream).text());
}

async function runCommand(argv: string[]): Promise<HelperCommandResult> {
  const proc = Bun.spawn(argv, {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(proc.stdout),
    readStream(proc.stderr),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
}

async function shouldRebuildHelper(): Promise<boolean> {
  try {
    const [sourceStats, infoPlistStats, binaryStats, bundledPlistStats] = await Promise.all([
      stat(HELPER_SOURCE_PATH),
      stat(HELPER_INFO_PLIST_PATH),
      stat(HELPER_BINARY_PATH),
      stat(HELPER_BUNDLE_INFO_PLIST_PATH),
    ]);

    const latestInput = Math.max(sourceStats.mtimeMs, infoPlistStats.mtimeMs);
    const oldestOutput = Math.min(binaryStats.mtimeMs, bundledPlistStats.mtimeMs);

    return latestInput > oldestOutput;
  } catch {
    return true;
  }
}

async function ensureHelperDirectory(): Promise<void> {
  await mkdir(HELPER_MACOS_PATH, { recursive: true });
}

function getFailureDetails(result: HelperCommandResult): string {
  return result.stderr || result.stdout || `exit code ${result.exitCode}`;
}

function assertCommandSucceeded(result: HelperCommandResult, context: string): void {
  if (result.exitCode === 0) return;
  throw new Error(`${context}: ${getFailureDetails(result)}`);
}

async function compileHelperBinary(): Promise<void> {
  console.log('[transcription] Building macOS Speech helper...');
  const result = await runCommand([
    'xcrun',
    'swiftc',
    '-framework',
    'Speech',
    '-o',
    HELPER_BINARY_PATH,
    HELPER_SOURCE_PATH,
  ]);

  assertCommandSucceeded(result, 'Failed to build transcription helper');
}

async function installHelperInfoPlist(): Promise<void> {
  await copyFile(HELPER_INFO_PLIST_PATH, HELPER_BUNDLE_INFO_PLIST_PATH);
}

async function signHelperBundle(): Promise<void> {
  const result = await runCommand(['/usr/bin/codesign', '--force', '--sign', '-', HELPER_BUNDLE_PATH]);
  assertCommandSucceeded(result, 'Failed to sign transcription helper bundle');
}

async function buildHelperBundle(): Promise<string> {
  await ensureHelperDirectory();

  if (!(await shouldRebuildHelper())) {
    return HELPER_BUNDLE_PATH;
  }

  await installHelperInfoPlist();
  await compileHelperBinary();
  await signHelperBundle();
  return HELPER_BUNDLE_PATH;
}

async function ensureHelperBundle(): Promise<string> {
  if (!helperBundlePromise) {
    helperBundlePromise = buildHelperBundle();
  }

  try {
    return await helperBundlePromise;
  } catch (error) {
    helperBundlePromise = null;
    throw error;
  }
}

function decodeHelperPayload(payloadText: string): unknown {
  try {
    return JSON.parse(payloadText);
  } catch {
    throw new Error(`Invalid JSON from transcription helper: ${payloadText}`);
  }
}

function assertHelperPayloadHasNoError(
  payload: Partial<HelperErrorPayload>,
  context: string
): void {
  if (typeof payload.error !== 'string' || payload.error.length === 0) return;
  throw new Error(`Transcription helper failed during ${context}: ${payload.error}`);
}

function parseHelperPayload<T>(payloadText: string, context: string): T {
  const payload = decodeHelperPayload(payloadText) as T & Partial<HelperErrorPayload>;

  assertHelperPayloadHasNoError(payload, context);
  return payload;
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return normalizeCommandOutput(await readFile(filePath, 'utf-8'));
  } catch {
    return '';
  }
}

async function runHelper(args: string[]): Promise<string> {
  const helperBundlePath = await ensureHelperBundle();
  const tempDirectory = await mkdtemp(join(tmpdir(), 'adhd-healing-helper-run-'));
  const outputPath = join(tempDirectory, 'result.json');

  try {
    const result = await runCommand([
      'open',
      '-W',
      '-n',
      helperBundlePath,
      '--args',
      ...args,
      '--output',
      outputPath,
    ]);
    const payloadText = await readOptionalFile(outputPath);

    if (payloadText.length > 0) {
      return payloadText;
    }

    assertCommandSucceeded(result, 'Transcription helper failed to launch');
    throw new Error('Transcription helper produced no output');
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

function normalizeDetectedExtension(fileName?: string): string {
  if (!fileName) return '';
  return extname(fileName).trim().toLowerCase();
}

function resolveMimeTypeExtension(mimeType?: string): string | undefined {
  if (!mimeType) return undefined;
  return MIME_TYPE_EXTENSIONS[mimeType];
}

function firstNonEmptyValue(values: Array<string | undefined>): string | undefined {
  return values.find(value => Boolean(value && value.length > 0));
}

function resolveAudioExtension(fileName?: string, mimeType?: string): string {
  return (
    firstNonEmptyValue([
      normalizeDetectedExtension(fileName),
      resolveMimeTypeExtension(mimeType),
    ]) ?? DEFAULT_AUDIO_EXTENSION
  );
}

export async function checkTranscriptionSupport(): Promise<void> {
  console.log('[transcription] Checking macOS Speech support...');
  const payloadText = await runHelper(['--check']);
  const payload = parseHelperPayload<HelperCheckPayload>(payloadText, 'health check');

  if (payload.status !== 'ok') {
    throw new Error(`Unexpected transcription helper health status: ${payload.status}`);
  }

  console.log(`[transcription] macOS Speech ready (${payload.locale}).`);
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  options: TranscriptionOptions = {}
): Promise<string> {
  console.log('[transcription] Transcribing audio...');

  const extension = resolveAudioExtension(options.fileName, options.mimeType);
  const tempDirectory = await mkdtemp(join(tmpdir(), 'adhd-healing-audio-'));
  const audioPath = join(tempDirectory, `input${extension}`);

  try {
    await writeFile(audioPath, audioBuffer);
    const payloadText = await runHelper(['--input', audioPath]);
    const payload = parseHelperPayload<HelperTranscriptionPayload>(payloadText, 'audio transcription');
    const text = payload.text.trim();

    if (text.length === 0) {
      throw new Error('Transcription helper returned empty text');
    }

    console.log('[transcription] Done.');
    return text;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
