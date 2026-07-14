import { describe, it, expect } from 'vitest';
import { buildApp } from '../app';
import type { OrderZone, OrderRef } from '@shadrin-v/contracts';

// Minimal fake adapter implementing the shape orders routes depend on.
const fakeErpnext = {
  async importOrder(orderId: string): Promise<OrderZone> {
    return {
      orderId,
      positions: [
        { itemCode: 'ABB101', itemName: 'Palette', quantity: 10, dimensionsSource: 'manual' },
      ],
    };
  },
  async searchOrders(query: string): Promise<OrderRef[]> {
    return [{ orderId: `SAL-ORD-${query}`, customer: 'ACME' }];
  },
};

describe('order routes (adapter configured)', () => {
  it('GET /api/orders/:id imports the order', async () => {
    const app = buildApp({ erpnext: fakeErpnext });
    const res = await app.inject({ method: 'GET', url: '/api/orders/SAL-ORD-2026-00001' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ orderId: 'SAL-ORD-2026-00001' });
    await app.close();
  });

  it('GET /api/orders?q= searches orders', async () => {
    const app = buildApp({ erpnext: fakeErpnext });
    const res = await app.inject({ method: 'GET', url: '/api/orders?q=2026' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ orderId: 'SAL-ORD-2026', customer: 'ACME' }]);
    await app.close();
  });
});

describe('order routes (adapter NOT configured — local test mode)', () => {
  it('GET /api/orders/:id returns 503 ERR_ERPNEXT_UNCONFIGURED', async () => {
    const app = buildApp(); // no erpnext adapter
    const res = await app.inject({ method: 'GET', url: '/api/orders/SO-1' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'ERR_ERPNEXT_UNCONFIGURED' });
    await app.close();
  });

  it('GET /api/orders?q= returns 503 ERR_ERPNEXT_UNCONFIGURED', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/orders?q=x' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'ERR_ERPNEXT_UNCONFIGURED' });
    await app.close();
  });
});
