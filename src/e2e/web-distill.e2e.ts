import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { IdeaRow, LlmDecision, Session, SessionMessage, SessionStatus } from '../types.js';

const CHROME_EXECUTABLE_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const REMINDER_CAPTURE_PATH = join(process.cwd(), '.tmp', 'e2e-reminders.json');

type StoredIdea = Readonly<{
  distilledText: string;
  rawText: string;
  vectorStr: string;
}>;

type TestState = {
  nextMessageId: number;
  nextSessionId: number;
  decisions: LlmDecision[];
  ideaWrites: StoredIdea[];
  reminderWrites: Array<Readonly<{ description: string; taskTitle: string }>>;
  sessions: Map<string, Session>;
  messages: Map<string, SessionMessage[]>;
  similarIdeas: IdeaRow[];
  transcribedText: string;
  transcriptionCalls: Array<Readonly<{ byteLength: number; fileName?: string; mimeType?: string }>>;
};

function createSessionRecord(id: string): Session {
  const now = new Date('2026-07-29T00:00:00.000Z');

  return {
    id,
    status: 'clarifying',
    turn_count: 0,
    created_at: now,
    updated_at: now,
  };
}

function createSessionId(sequence: number): string {
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

function createState(): TestState {
  return {
    nextMessageId: 1,
    nextSessionId: 1,
    decisions: [
      {
        type: 'clarify',
        message: '你这次最想先验证的用户结果是什么？',
      },
      {
        type: 'final',
        message: '蒸馏完成',
        markdown: '最终落点是做一个可搜索的想法网关。',
      },
    ],
    ideaWrites: [],
    reminderWrites: [],
    sessions: new Map<string, Session>(),
    messages: new Map<string, SessionMessage[]>(),
    similarIdeas: [],
    transcribedText: '这是转写后的音频内容，用来生成最终 markdown。',
    transcriptionCalls: [],
  };
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    created_at: new Date(session.created_at),
    updated_at: new Date(session.updated_at),
  };
}

function getSessionMessages(sessionId: string): SessionMessage[] {
  return state.messages.get(sessionId) ?? [];
}

function appendMessage(
  sessionId: string,
  role: SessionMessage['role'],
  inputMode: SessionMessage['input_mode'],
  content: string
): void {
  const nextMessage: SessionMessage = {
    id: state.nextMessageId,
    session_id: sessionId,
    role,
    input_mode: inputMode,
    content,
    created_at: new Date(`2026-07-29T00:00:${String(state.nextMessageId).padStart(2, '0')}.000Z`),
  };

  state.nextMessageId += 1;
  state.messages.set(sessionId, [...getSessionMessages(sessionId), nextMessage]);
}

async function persistReminderCapture(): Promise<void> {
  await mkdir(dirname(REMINDER_CAPTURE_PATH), { recursive: true });
  await writeFile(REMINDER_CAPTURE_PATH, JSON.stringify(state.reminderWrites, null, 2), 'utf-8');
}

let state = createState();

mock.module('../services/embedding.js', () => ({
  getEmbedding: async (): Promise<number[]> => [0.1, 0.2, 0.3],
  formatVectorForPg: (vector: number[]): string => `[${vector.join(',')}]`,
}));

mock.module('../services/clarification.js', () => ({
  makeDecision: async (): Promise<LlmDecision> => {
    const nextDecision = state.decisions.shift();
    if (!nextDecision) {
      throw new Error('No mocked decision left for E2E flow');
    }

    return nextDecision;
  },
  isFinalDecision: (decision: LlmDecision): boolean => decision.type === 'final',
}));

mock.module('../services/transcription.js', () => ({
  transcribeAudio: async (
    audioBuffer: Buffer,
    options: { fileName?: string; mimeType?: string } = {}
  ): Promise<string> => {
    state.transcriptionCalls.push({
      byteLength: audioBuffer.byteLength,
      fileName: options.fileName,
      mimeType: options.mimeType,
    });
    return state.transcribedText;
  },
}));

mock.module('../services/reminders.js', () => ({
  syncToAppleReminders: async (taskTitle: string, description: string): Promise<void> => {
    state.reminderWrites.push({ taskTitle, description });
    await persistReminderCapture();
  },
}));

mock.module('../db/queries/ideas.js', () => ({
  insertIdea: async (vectorStr: string, rawText: string, distilledText: string): Promise<void> => {
    state.ideaWrites.push({ vectorStr, rawText, distilledText });
  },
  findSimilarIdeas: async (): Promise<IdeaRow[]> => state.similarIdeas,
}));

mock.module('../db/queries/messages.js', () => ({
  insertMessage: async (
    sessionId: string,
    role: SessionMessage['role'],
    inputMode: SessionMessage['input_mode'],
    content: string
  ): Promise<void> => {
    appendMessage(sessionId, role, inputMode, content);
  },
  getMessagesBySessionId: async (sessionId: string): Promise<SessionMessage[]> => {
    return getSessionMessages(sessionId).map(message => ({
      ...message,
      created_at: new Date(message.created_at),
    }));
  },
}));

mock.module('../db/queries/sessions.js', () => ({
  findSessionById: async (id: string): Promise<Session | null> => {
    const session = state.sessions.get(id);
    return session ? cloneSession(session) : null;
  },
  createSession: async (): Promise<Session> => {
    const sessionId = createSessionId(state.nextSessionId);
    const session = createSessionRecord(sessionId);
    state.nextSessionId += 1;
    state.sessions.set(sessionId, session);
    return cloneSession(session);
  },
  incrementTurnCount: async (id: string): Promise<void> => {
    const session = state.sessions.get(id);
    if (!session) {
      throw new Error(`Missing session for incrementTurnCount: ${id}`);
    }

    const nextSession: Session = {
      ...session,
      turn_count: session.turn_count + 1,
      updated_at: new Date('2026-07-29T00:01:00.000Z'),
    };
    state.sessions.set(id, nextSession);
  },
  updateSessionStatus: async (id: string, status: SessionStatus): Promise<void> => {
    const session = state.sessions.get(id);
    if (!session) {
      throw new Error(`Missing session for updateSessionStatus: ${id}`);
    }

    state.sessions.set(id, {
      ...session,
      status,
      updated_at: new Date('2026-07-29T00:02:00.000Z'),
    });
  },
  completeSessionWithFinalMessage: async (id: string, assistantMessage: string): Promise<void> => {
    appendMessage(id, 'assistant', 'system', assistantMessage);
    const session = state.sessions.get(id);
    if (!session) {
      throw new Error(`Missing session for completeSessionWithFinalMessage: ${id}`);
    }

    state.sessions.set(id, {
      ...session,
      status: 'completed',
      updated_at: new Date('2026-07-29T00:03:00.000Z'),
    });
  },
}));

const { handleDistill } = await import('../routes/distill/index.js');
const { handleWebAsset } = await import('../web/static.js');

async function routeRequest(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (pathname === '/distill') {
    if (req.method === 'POST') {
      return handleDistill(req);
    }

    return new Response('Method Not Allowed', { status: 405 });
  }

  if (req.method === 'GET') {
    const staticResponse = await handleWebAsset(pathname);
    if (staticResponse) return staticResponse;
  }

  return new Response('Not Found', { status: 404 });
}

let browser: Browser | null = null;
let page: Page | null = null;
let server: Bun.Server<undefined> | null = null;
let serverOrigin = '';

function getVaultPath(): string {
  const vaultPath = Bun.env.BRAIN_VAULT_PATH;
  if (!vaultPath) {
    throw new Error('Missing BRAIN_VAULT_PATH for E2E test');
  }

  return vaultPath;
}

async function cleanArtifacts(): Promise<void> {
  await rm(getVaultPath(), { recursive: true, force: true });
  await rm(REMINDER_CAPTURE_PATH, { force: true });
}

beforeAll(async () => {
  if (!(await Bun.file(CHROME_EXECUTABLE_PATH).exists())) {
    throw new Error(`Google Chrome was not found at ${CHROME_EXECUTABLE_PATH}`);
  }

  browser = await chromium.launch({
    executablePath: CHROME_EXECUTABLE_PATH,
    headless: true,
  });

  server = Bun.serve({
    port: 0,
    fetch: routeRequest,
  });
  serverOrigin = `http://127.0.0.1:${server.port}`;
});

beforeEach(async () => {
  state = createState();
  await cleanArtifacts();
  await mkdir(getVaultPath(), { recursive: true });

  if (!browser) {
    throw new Error('Browser is not available for E2E test');
  }

  const context = await browser.newContext();
  page = await context.newPage();
});

afterEach(async () => {
  await page?.context().close();
  page = null;
});

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
  await cleanArtifacts();
});

describe('web distill flow', () => {
  it('goes from web text input to final markdown, vault write, and reminder sync', async () => {
    if (!page) {
      throw new Error('Page is not available for E2E test');
    }

    await page.goto(serverOrigin, { waitUntil: 'domcontentloaded' });

    await page.locator('#distill-text').fill('我想把每天零散的想法整理成能执行的计划。');
    await page.getByRole('button', { name: '发送文字' }).click();

    await page.waitForFunction(() => {
      return document.body.textContent?.includes('你这次最想先验证的用户结果是什么？') ?? false;
    });

    await page.locator('#distill-text').fill('先服务我自己，这周打通网页输入到 markdown 和 reminders。');
    await page.getByRole('button', { name: '发送文字' }).click();

    await page.waitForFunction(() => {
      return document.querySelector('.markdown-output')?.textContent?.includes('### 🎯 今日灵感内核') ?? false;
    });

    const finalMarkdown = await page.locator('.markdown-output').textContent();
    const resultMeta = await page.locator('.result-meta').textContent();
    const sessionMeta = await page.locator('.prompt-card .session-meta').textContent();

    expect(finalMarkdown).toContain('### 🎯 今日灵感内核');
    expect(finalMarkdown).toContain('最终落点是做一个可搜索的想法网关。');
    expect(finalMarkdown).toContain('### 🔄 历史思维连线 (RAG 检索结果)');
    expect(finalMarkdown).toContain('### 🚀 20分钟强制里程碑 (Milestone)');
    expect(finalMarkdown).toContain('明确 20 分钟第一步');
    expect(resultMeta).toContain('Milestone: 明确 20 分钟第一步');
    expect(sessionMeta).toContain('session_id: 00000000-0000-4000-8000-000000000001');

    const vaultFiles = await readdir(getVaultPath());
    expect(vaultFiles).toHaveLength(1);

    const savedVault = await readFile(join(getVaultPath(), vaultFiles[0] as string), 'utf-8');
    expect(savedVault).toContain('title: "最终落点是做一个可搜索的想法网关"');
    expect(savedVault).toContain('### 🎯 今日灵感内核');
    expect(savedVault).toContain('## 原始意识流记录');
    expect(savedVault).toContain('我想把每天零散的想法整理成能执行的计划。');
    expect(savedVault).toContain('先服务我自己，这周打通网页输入到 markdown 和 reminders。');

    const reminderCapture = JSON.parse(await readFile(REMINDER_CAPTURE_PATH, 'utf-8')) as Array<{
      description: string;
      taskTitle: string;
    }>;
    expect(reminderCapture).toHaveLength(1);
    expect(reminderCapture[0]?.taskTitle).toBe('明确 20 分钟第一步');
    expect(reminderCapture[0]?.description).toContain('## 完整蒸馏输出');
    expect(reminderCapture[0]?.description).toContain('### 🚀 20分钟强制里程碑 (Milestone)');

    expect(state.ideaWrites).toHaveLength(1);
    expect(state.ideaWrites[0]?.rawText).toBe([
      '我想把每天零散的想法整理成能执行的计划。',
      '先服务我自己，这周打通网页输入到 markdown 和 reminders。',
    ].join('\n\n'));
    expect(state.ideaWrites[0]?.distilledText).toBe(finalMarkdown ?? '');
    expect(state.sessions.get('00000000-0000-4000-8000-000000000001')?.status).toBe('completed');
    expect(getSessionMessages('00000000-0000-4000-8000-000000000001')).toHaveLength(4);
  });

  it('accepts an audio upload from the web client and still lands final markdown and reminder output', async () => {
    if (!page) {
      throw new Error('Page is not available for E2E test');
    }

    state.decisions = [
      {
        type: 'final',
        message: '蒸馏完成',
        markdown: '音频入口也能走到最终落地。',
      },
    ];

    await page.goto(serverOrigin, { waitUntil: 'domcontentloaded' });

    await page.locator('#audio-upload').setInputFiles({
      name: 'idea-note.m4a',
      mimeType: 'audio/mp4',
      buffer: Buffer.from('fake-audio-content'),
    });

    await page.waitForFunction(() => {
      return document.body.textContent?.includes('当前文件：idea-note.m4a') ?? false;
    });

    await page.getByRole('button', { name: '发送录音' }).click();

    await page.waitForFunction(() => {
      return document.querySelector('.markdown-output')?.textContent?.includes('### 🎯 今日灵感内核') ?? false;
    });

    const finalMarkdown = await page.locator('.markdown-output').textContent();

    expect(finalMarkdown).toContain('### 🎯 今日灵感内核');
    expect(finalMarkdown).toContain('音频入口也能走到最终落地。');
    expect(finalMarkdown).toContain('### 🚀 20分钟强制里程碑 (Milestone)');
    expect(state.transcriptionCalls).toEqual([
      {
        byteLength: Buffer.from('fake-audio-content').byteLength,
        fileName: 'idea-note.m4a',
        mimeType: 'audio/x-m4a',
      },
    ]);
    expect(state.ideaWrites).toHaveLength(1);
    expect(state.ideaWrites[0]?.rawText).toBe('这是转写后的音频内容，用来生成最终 markdown。');
    expect(getSessionMessages('00000000-0000-4000-8000-000000000001')).toHaveLength(2);
    expect(getSessionMessages('00000000-0000-4000-8000-000000000001')[0]?.input_mode).toBe('audio');

    const vaultFiles = await readdir(getVaultPath());
    expect(vaultFiles).toHaveLength(1);

    const savedVault = await readFile(join(getVaultPath(), vaultFiles[0] as string), 'utf-8');
    expect(savedVault).toContain('这是转写后的音频内容，用来生成最终 markdown。');
    expect(savedVault).toContain('音频入口也能走到最终落地。');

    const reminderCapture = JSON.parse(await readFile(REMINDER_CAPTURE_PATH, 'utf-8')) as Array<{
      description: string;
      taskTitle: string;
    }>;
    expect(reminderCapture).toHaveLength(1);
    expect(reminderCapture[0]?.taskTitle).toBe('明确 20 分钟第一步');
  });
});