import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
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

  // Кривое тело — ошибка клиента (LKWkalk-5zy): схемы роутов режут его 400-кой в конверте ApiError
  // ({code, details}), как остальные ошибки API. Всё прочее уходит в дефолтную обработку Fastify —
  // reply.send(err) сохраняет её сериализацию и статус (в т.ч. 500) один в один.
  // Параметр типизирован явно: инференс Fastify здесь различается между локальной и свежей (CI)
  // установкой и на CI давал 'err: unknown'.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err.validation) {
      return reply.code(400).send({ code: 'ERR_VALIDATION', details: { message: err.message } });
    }
    return reply.send(err);
  });

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
