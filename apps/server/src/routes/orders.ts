import type { FastifyInstance, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import type { OrderSource } from '../erpnext/adapter';
import { upsertFromErp } from '../db/articles';
import type { Article } from '@shadrin-v/contracts';

/**
 * ERPNext order endpoints. `erpnext` is undefined when secrets are not configured (today's local
 * test mode) — then every call returns 503 ERR_ERPNEXT_UNCONFIGURED instead of failing obscurely.
 * Importing an order also seeds the article catalogue: those are exactly the articles the user
 * works with, and they arrive with whatever dimensions ERPNext holds.
 */
export function ordersRoutes(app: FastifyInstance, erpnext?: OrderSource, db?: Database.Database): void {
  const unconfigured = (reply: FastifyReply) =>
    reply.code(503).send({ code: 'ERR_ERPNEXT_UNCONFIGURED' });

  app.get('/api/orders', async (req, reply) => {
    if (!erpnext) return unconfigured(reply);
    const { q } = req.query as { q?: string };
    return erpnext.searchOrders(q ?? '');
  });

  app.get('/api/orders/:id', async (req, reply) => {
    if (!erpnext) return unconfigured(reply);
    const { id } = req.params as { id: string };
    const zone = await erpnext.importOrder(id);
    if (!db) return zone;
    const now = new Date().toISOString();
    const catalogue = new Map<string, Article>();
    const seedAll = db.transaction(() => {
      for (const p of zone.positions) {
        catalogue.set(
          p.itemCode,
          upsertFromErp(
            db,
            { itemCode: p.itemCode, name: p.itemName, length: p.length, width: p.width, height: p.height },
            { now },
          ),
        );
      }
    });
    try {
      seedAll();
    } catch (err) {
      // Catalogue seeding is best-effort enrichment: ERPNext already answered successfully, so a
      // write failure here must not cost the caller the zone it already has. The transaction
      // rolled back, so the catalogue is untouched rather than half-seeded — and the zone goes out
      // exactly as ERPNext delivered it, without catalogue rules.
      req.log.error({ err, orderId: id }, 'failed to seed article catalogue from imported order');
      return zone;
    }
    // Only a committed transaction may speak for the catalogue: positions carry the rules the
    // article really has now. Dimensions and dimensionsSource stay ERPNext's, untouched.
    return {
      ...zone,
      positions: zone.positions.map((p) => {
        const a = catalogue.get(p.itemCode);
        if (!a) return p;
        return {
          ...p,
          rules: a.rules,
          ...(a.nestStepPairwise !== undefined && { nestStepPairwise: a.nestStepPairwise }),
          ...(a.nestStepSequential !== undefined && { nestStepSequential: a.nestStepSequential }),
        };
      }),
    };
  });
}
