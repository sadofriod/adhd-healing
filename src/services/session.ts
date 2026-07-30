export type SessionMessage = {
  role: 'user' | 'assistant';
  content: string;
};

let currentSession: SessionMessage[] | null = null;

export function getSession(): SessionMessage[] {
  if (!currentSession) currentSession = [];
  return currentSession;
}

export function resetSession(): void {
  currentSession = [];
  console.log('[session] 开启新一轮脑暴 Session');
}

export function appendToSession(role: 'user' | 'assistant', content: string): void {
  if (!currentSession) currentSession = [];
  currentSession.push({ role, content });
}

export function clearSession(): void {
  currentSession = null;
}

