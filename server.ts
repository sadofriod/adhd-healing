import { config } from './src/config/env.js';
import { initDatabase } from './src/db/init.js';
import { handleDistill } from './src/routes/distill/index.js';
import { verifyStartupDependencies } from './src/services/startup.js';
import { handleWebAsset } from './src/web/static.js';

async function handleNonDistillRoute(req: Request, pathname: string): Promise<Response | null> {
  if (req.method !== 'GET') return null;
  return handleWebAsset(pathname);
}

async function routeRequest(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const matchedResponse = pathname === '/distill'
    ? await handleDistillRoute(req)
    : await handleNonDistillRoute(req, pathname);
  return matchedResponse ?? new Response('Not Found', { status: 404 });
}

async function handleDistillRoute(req: Request): Promise<Response> {
  if (req.method === 'POST') return handleDistill(req);
  return new Response('Method Not Allowed', { status: 405 });
}

await initDatabase();
await verifyStartupDependencies();

const server = Bun.serve({
  port: config.port,
  fetch: routeRequest,
});

console.log(`[server] Listening on port ${server.port}`);
