import { config } from './src/config/env';
import { verifyStartupDependencies } from './src/services/startup';
import { closeMcpServers } from './src/services/mcp';
import { handleDistill } from './src/routes/distill/index';
import { handleSessions } from './src/routes/sessions';
import { handleWebAsset } from './src/web/static';
import { getRequestLocale, type Locale } from './src/i18n/locale';
import { getServerMessage } from './src/i18n/server-messages';

async function handleNonDistillRoute(
  req: Request,
  pathname: string,
  locale: Locale
): Promise<Response | null> {
  if (req.method !== 'GET') return null;
  return handleWebAsset(pathname, locale);
}

async function handleApiRoute(req: Request, pathname: string): Promise<Response | null> {
  if (pathname === '/distill') return handleDistillRoute(req);
  if (pathname.startsWith('/sessions')) return handleSessions(req);
  return null;
}

async function routeRequest(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const locale = getRequestLocale(req);
  const matchedResponse = await handleApiRoute(req, pathname)
    ?? await handleNonDistillRoute(req, pathname, locale);
  return matchedResponse ?? new Response(getServerMessage(locale, 'notFound'), { status: 404 });
}

async function handleDistillRoute(req: Request): Promise<Response> {
  const locale = getRequestLocale(req);
  if (req.method === 'POST') return handleDistill(req);
  return new Response(getServerMessage(locale, 'methodNotAllowed'), { status: 405 });
}

await verifyStartupDependencies();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await closeMcpServers();
    process.exit(0);
  });
}

const server = Bun.serve({
  port: config.port,
  fetch: routeRequest,
});

console.log(`[server] 🚀 Gateway listening on http://localhost:${server.port}`);
