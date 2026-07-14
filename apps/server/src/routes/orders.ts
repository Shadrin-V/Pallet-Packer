import type { FastifyInstance, FastifyReply } from 'fastify';
import type { OrderSource } from '../erpnext/adapter';

/**
 * ERPNext order endpoints. `erpnext` is undefined when secrets are not configured (today's local
 * test mode) — then every call returns 503 ERR_ERPNEXT_UNCONFIGURED instead of failing obscurely.
 */
export function ordersRoutes(app: FastifyInstance, erpnext?: OrderSource): void {
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
    return erpnext.importOrder(id);
  });
}
