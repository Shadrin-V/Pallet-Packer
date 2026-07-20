import { describe, it, expect } from 'vitest';
import { buildApp } from '../app';
import type { OrderZone, OrderRef } from '@shadrin-v/contracts';
import { openDb } from '../db/schema';
import { upsertArticle, getArticle } from '../db/articles';

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

  it('importing an order seeds the article catalogue and keeps local rules', async () => {
    const db = openDb(':memory:');
    // an article the user already configured by hand
    upsertArticle(
      db,
      { itemCode: 'ABB101', name: 'Meine Palette', rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly', maxTiers: 4 } },
      { now: '2026-07-20T09:00:00.000Z' },
    );
    const erpnext = {
      importOrder: async () => ({
        orderId: 'SO-1',
        positions: [
          { itemCode: 'ABB101', itemName: 'Einwegpalette 600x800', quantity: 10, length: 800, width: 600, height: 144, dimensionsSource: 'erpnext-field' as const },
          { itemCode: 'NEW-1', itemName: 'Ohne Maße', quantity: 2, dimensionsSource: 'manual' as const },
        ],
      }),
      searchOrders: async () => [],
    };
    const app = buildApp({ db, erpnext });

    const res = await app.inject({ method: 'GET', url: '/api/orders/SO-1' });
    expect(res.statusCode).toBe(200);

    const abb = getArticle(db, 'ABB101')!;
    expect(abb).toMatchObject({ length: 800, width: 600, height: 144, source: 'erp' });
    expect(abb.rules.maxTiers).toBe(4); // local rules survive the import
    const fresh = getArticle(db, 'NEW-1')!;
    expect(fresh.name).toBe('Ohne Maße');
    expect(fresh.length).toBeUndefined(); // no dimensions in ERPNext yet — no error, just empty
    await app.close();
  });

  it('returns the order zone even when catalogue seeding fails', async () => {
    const db = openDb(':memory:');
    // Provoke a genuine SQLite write failure: the article table is gone, so upsertFromErp's
    // INSERT throws "no such table: article" — not a mock, a real error from the driver.
    db.exec('DROP TABLE article');
    const erpnext = {
      importOrder: async (): Promise<OrderZone> => ({
        orderId: 'SO-2',
        positions: [
          { itemCode: 'ABB101', itemName: 'Palette', quantity: 10, dimensionsSource: 'manual' },
        ],
      }),
      searchOrders: async () => [],
    };
    const app = buildApp({ db, erpnext });

    const res = await app.inject({ method: 'GET', url: '/api/orders/SO-2' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      orderId: 'SO-2',
      positions: [{ itemCode: 'ABB101', itemName: 'Palette', quantity: 10 }],
    });
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
