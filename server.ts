import { config } from './src/config/env.js';
import { initDatabase } from './src/db/init.js';
import { handleDistill } from './src/routes/distill/index.js';

async function routeRequest(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === '/distill') return handleDistillRoute(req);
  return new Response('Not Found', { status: 404 });
}

async function handleDistillRoute(req: Request): Promise<Response> {
  if (req.method === 'POST') return handleDistill(req);
  return new Response('Method Not Allowed', { status: 405 });
}

await initDatabase();

const server = Bun.serve({
  port: config.port,
  fetch: routeRequest,
});

console.log(`[server] Listening on port ${server.port}`);
