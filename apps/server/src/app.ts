import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';
import { vehiclesRoutes } from './routes/vehicles';
import { plansRoutes } from './routes/plans';

export interface BuildAppOptions {
  staticDir?: string;
  db?: Database.Database;
}

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ status: 'ok', contract: ENGINE_CONTRACT_VERSION }));

  if (opts.db) {
    vehiclesRoutes(app, opts.db);
    plansRoutes(app, opts.db);
  }

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
