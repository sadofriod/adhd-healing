import { useState } from 'react';
import { z } from 'zod';
import type { SessionHistoryItem } from '../../types';

type SessionHistoryState = {
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly sessions: readonly SessionHistoryItem[];
  readonly activate: (session: SessionHistoryItem) => Promise<SessionHistoryItem | null>;
  readonly refresh: () => Promise<void>;
};

export async function fetchSessionHistory(): Promise<readonly SessionHistoryItem[]> {
  const response = await fetch('/sessions');
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<readonly SessionHistoryItem[]>;
}

export async function activateSessionRequest(sessionId: string): Promise<void> {
  const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/activate`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(await readError(response));
}

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = z.object({ error: z.string() }).safeParse(body);
  return parsed.success ? parsed.data.error : `请求失败 (${response.status})`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return fallback;
}

function getActivatedStatus(
  item: SessionHistoryItem,
  selectedId: string
): SessionHistoryItem['status'] {
  if (item.id === selectedId) return 'ACTIVE';
  if (item.status === 'ACTIVE') return 'ABANDONED';
  return item.status;
}

export function useSessionHistory(): SessionHistoryState {
  const [sessions, setSessions] = useState<readonly SessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setSessions(await fetchSessionHistory());
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '无法读取历史会话'));
    } finally {
      setIsLoading(false);
    }
  }

  async function activate(session: SessionHistoryItem): Promise<SessionHistoryItem | null> {
    setErrorMessage(null);
    try {
      await activateSessionRequest(session.id);
      setSessions(current => current.map(item => ({
        ...item,
        status: getActivatedStatus(item, session.id),
      })));
      return { ...session, status: 'ACTIVE', finishedAt: null };
    } catch (error) {
      setErrorMessage(getErrorMessage(error, '无法继续此会话'));
      return null;
    }
  }

  return { activate, errorMessage, isLoading, refresh, sessions };
}