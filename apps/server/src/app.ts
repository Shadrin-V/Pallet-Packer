import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';

export interface BuildAppOptions {
  staticDir?: string;
}

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ status: 'ok', contract: ENGINE_CONTRACT_VERSION }));

  if (opts.staticDir) {
    app.register(fastifyStatic, { root: opts.staticDir });
    // SPA fallback: client-side routes get index.html; unknown /api paths stay JSON 404.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
