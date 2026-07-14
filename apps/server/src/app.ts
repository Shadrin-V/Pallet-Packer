import Fastify, { type FastifyInstance } from 'fastify';
import { ENGINE_CONTRACT_VERSION } from '@shadrin-v/engine';

export interface BuildAppOptions {
  staticDir?: string;
}

export function buildApp(_opts: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ status: 'ok', contract: ENGINE_CONTRACT_VERSION }));
  return app;
}
