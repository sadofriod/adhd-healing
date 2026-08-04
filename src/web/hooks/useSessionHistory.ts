import { useState } from 'react';
import { z } from 'zod';
import type { Locale } from '../../i18n/locale';
import type { SessionHistoryItem } from '../../types';
import { getWebMessage } from '../i18n/messages';

type SessionHistoryState = {
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly sessions: readonly SessionHistoryItem[];
  readonly activate: (session: SessionHistoryItem) => Promise<SessionHistoryItem | null>;
  readonly refresh: () => Promise<void>;
};

export async function fetchSessionHistory(locale: Locale): Promise<readonly SessionHistoryItem[]> {
  const response = await fetch('/sessions', {
    headers: { 'X-Locale': locale },
  });
  if (!response.ok) throw new Error(await readError(response, locale));
  return response.json() as Promise<readonly SessionHistoryItem[]>;
}

export async function activateSessionRequest(sessionId: string, locale: Locale): Promise<void> {
  const response = await fetch(`/sessions/${encodeURIComponent(sessionId)}/activate`, {
    method: 'POST',
    headers: { 'X-Locale': locale },
  });
  if (!response.ok) throw new Error(await readError(response, locale));
}

async function readError(response: Response, locale: Locale = 'zh'): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = z.object({ error: z.string() }).safeParse(body);
  const fallbackPrefix = getWebMessage(locale, 'historyRequestFailedPrefix');
  return parsed.success ? parsed.data.error : `${fallbackPrefix} (${response.status})`;
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

export function useSessionHistory(locale: Locale): SessionHistoryState {
  const [sessions, setSessions] = useState<readonly SessionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setSessions(await fetchSessionHistory(locale));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, getWebMessage(locale, 'historyReadFailed')));
    } finally {
      setIsLoading(false);
    }
  }

  async function activate(session: SessionHistoryItem): Promise<SessionHistoryItem | null> {
    setErrorMessage(null);
    try {
      await activateSessionRequest(session.id, locale);
      setSessions(current => current.map(item => ({
        ...item,
        status: getActivatedStatus(item, session.id),
      })));
      return { ...session, status: 'ACTIVE', finishedAt: null };
    } catch (error) {
      setErrorMessage(getErrorMessage(error, getWebMessage(locale, 'historyActivateFailed')));
      return null;
    }
  }

  return { activate, errorMessage, isLoading, refresh, sessions };
}