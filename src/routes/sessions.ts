import { activateSession, listSessionHistory } from '../services/session';
import { getRequestLocale, type Locale } from '../i18n/locale';
import { getServerMessage } from '../i18n/server-messages';

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

function activationResponse(wasActivated: boolean, locale: Locale): Response {
  if (wasActivated) return new Response(null, { status: 204 });
  return jsonResponse({ error: getServerMessage(locale, 'sessionNotFound') }, 404);
}

async function handleSessionActivation(
  req: Request,
  pathname: string,
  locale: Locale
): Promise<Response | null> {
  if (req.method !== 'POST') return null;
  const sessionId = getSessionId(pathname);
  if (!sessionId) return null;
  return activationResponse(await activateSession(sessionId), locale);
}

export async function handleSessions(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const locale = getRequestLocale(req);
  const listResponse = await handleSessionList(req, pathname);
  if (listResponse) return listResponse;
  return await handleSessionActivation(req, pathname, locale)
    ?? new Response(getServerMessage(locale, 'methodNotAllowed'), { status: 405 });
}