import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import { calculateLayout } from '@shadrin-v/engine';
import type { LoadingPlanInput } from '@shadrin-v/contracts';
import { getPlan, listPlans, savePlan } from '../db/plans';
import { loadingPlanInputBody } from './schemas';

/** Loading-plan endpoints. The layout is computed here (single source of truth: the engine). */
export function plansRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get('/api/plans', async () => listPlans(db));

  app.post('/api/plans', { schema: { body: loadingPlanInputBody } }, async (req, reply: FastifyReply) => {
    const input = req.body as LoadingPlanInput;
    const layout = calculateLayout(input.load);
    // Движок сообщает о непригодном вводе ЗНАЧЕНИЕМ (layout.errors), а не исключением (api-contract
    // §3), поэтому «поймать» тут нечего — значение надо прочитать (LKWkalk-559). Раскладка с
    // ошибками — не план, а отчёт о непригодной заявке: сохранять её нельзя, иначе GET вернёт её как
    // обычный результат. Тот же инвариант держит SPA предохранителем в App (p3p.16).
    // Код отдельный от ERR_VALIDATION схемы тела: кривой JSON и невыполнимая заявка — разные
    // сценарии для клиента. Коды движка уходят как есть — переводит их UI (ADR 006).
    if (layout.errors?.length) {
      return reply.code(400).send({ code: 'ERR_INVALID_LOAD', details: { errors: layout.errors } });
    }
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
