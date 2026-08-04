import { activateSession, listSessionHistory } from '../services/session';

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function getSessionId(pathname: string): string | null {
  const match = pathname.match(/^\/sessions\/([^/]+)\/activate$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function handleSessionList(req: Request, pathname: string): Promise<Response | null> {
  if (req.method !== 'GET' || pathname !== '/sessions') return null;
  return jsonResponse(await listSessionHistory());
}

function activationResponse(wasActivated: boolean): Response {
  if (wasActivated) return new Response(null, { status: 204 });
  return jsonResponse({ error: 'Session not found' }, 404);
}

async function handleSessionActivation(
  req: Request,
  pathname: string
): Promise<Response | null> {
  if (req.method !== 'POST') return null;
  const sessionId = getSessionId(pathname);
  if (!sessionId) return null;
  return activationResponse(await activateSession(sessionId));
}

export async function handleSessions(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const listResponse = await handleSessionList(req, pathname);
  if (listResponse) return listResponse;
  return await handleSessionActivation(req, pathname)
    ?? new Response('Method Not Allowed', { status: 405 });
}