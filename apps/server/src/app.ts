import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';
import { vehiclesRoutes } from './routes/vehicles';
import { plansRoutes } from './routes/plans';
import { ordersRoutes } from './routes/orders';
import { articlesRoutes } from './routes/articles';
import type { OrderSource } from './erpnext/adapter';

export interface BuildAppOptions {
  staticDir?: string;
  db?: Database.Database;
  /** ERPNext order source; when absent, /api/orders returns 503 ERR_ERPNEXT_UNCONFIGURED. */
  erpnext?: OrderSource;
  /** Логгер Fastify (LKWkalk-fvh). По умолчанию выключен — тесты и локальные прогоны тихие;
   *  index.ts включает настоящий pino (JSON в stdout, его собирает Coolify). Без него req.log.*
   *  — no-op из abstract-logging, и сбой best-effort записи каталога (orders.ts) пропадал без
   *  следа. */
  logger?: FastifyServerOptions['logger'];
}

export function buildApp(opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });
  app.get('/api/health', async () => ({ status: 'ok', contract: ENGINE_CONTRACT_VERSION }));

  if (opts.db) {
    vehiclesRoutes(app, opts.db);
    plansRoutes(app, opts.db);
    articlesRoutes(app, opts.db);
  }
  ordersRoutes(app, opts.erpnext, opts.db);

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
