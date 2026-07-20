import type { FastifyInstance, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import type { OrderSource } from '../erpnext/adapter';
import { upsertFromErp } from '../db/articles';

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
    if (db) {
      const now = new Date().toISOString();
      const seedAll = db.transaction(() => {
        for (const p of zone.positions) {
          upsertFromErp(
            db,
            { itemCode: p.itemCode, name: p.itemName, length: p.length, width: p.width, height: p.height },
            { now },
          );
        }
      });
      try {
        seedAll();
      } catch (err) {
        // Catalogue seeding is best-effort enrichment: ERPNext already answered successfully, so a
        // write failure here must not cost the caller the zone it already has. The transaction
        // rolled back, so the catalogue is untouched rather than half-seeded.
        req.log.error({ err, orderId: id }, 'failed to seed article catalogue from imported order');
      }
    }
    return zone;
  });
}
