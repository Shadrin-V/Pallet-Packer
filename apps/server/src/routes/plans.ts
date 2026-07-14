import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import { calculateLayout } from '@shadrin-v/engine';
import type { LoadingPlanInput } from '@shadrin-v/contracts';
import { getPlan, listPlans, savePlan } from '../db/plans';

/** Loading-plan endpoints. The layout is computed here (single source of truth: the engine). */
export function plansRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/plans', async () => listPlans(db));

  app.post('/api/plans', async (req) => {
    const input = req.body as LoadingPlanInput;
    const layout = calculateLayout(input.load);
    return savePlan(db, input, layout, { id: randomUUID(), now: new Date().toISOString() });
  });

  app.get('/api/plans/:id', async (req, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      return getPlan(db, id);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'ERR_NOT_FOUND') return reply.code(404).send({ code });
      throw e;
    }
  });
}
