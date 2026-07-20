import { describe, it, expect } from 'vitest';
import { buildApp } from '../app';
import { openDb } from '../db/schema';

const V = { id: 'v1', name: 'LKW', length: 2000, width: 2000, height: 2000 };

describe('REST routes', () => {
  it('PUT then GET /api/vehicles', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    const put = await app.inject({ method: 'PUT', url: '/api/vehicles', payload: V });
    expect(put.statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: '/api/vehicles' });
    expect(res.json()).toEqual([V]);
    await app.close();
  });

  it('POST /api/plans computes the layout via the engine and persists it', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    const load = {
      vehicle: V,
      cargo: [
        {
          id: 'c1',
          name: 'Box',
          length: 1000,
          width: 1000,
          height: 1000,
          quantity: 8,
          rotation: 'none',
          stacking: { stackable: true },
          nesting: { nestable: false },
          state: 'entschachtelt',
        },
      ],
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      payload: { name: 'P', load, erpnextOrderIds: [] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // 2×2×2 m hold, 1×1×1 m boxes → exactly 8 placed.
    expect(body.layout.metrics.totalPlaced).toBe(8);
    expect(typeof body.id).toBe('string');

    const got = await app.inject({ method: 'GET', url: `/api/plans/${body.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json().name).toBe('P');

    const list = await app.inject({ method: 'GET', url: '/api/plans' });
    expect(list.json().map((p: { id: string }) => p.id)).toContain(body.id);
    await app.close();
  });

  it('GET /api/plans/:id returns 404 JSON for a missing plan', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    const res = await app.inject({ method: 'GET', url: '/api/plans/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'ERR_NOT_FOUND' });
    await app.close();
  });

  it('PUT then GET /api/articles searches the catalogue', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    const put = await app.inject({
      method: 'PUT',
      url: '/api/articles/ABB101',
      payload: {
        itemCode: 'ABB101',
        name: 'Einwegpalette',
        length: 800,
        width: 600,
        height: 144,
        nestStepPairwise: 22,
        rules: { state: 'verschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' },
      },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ itemCode: 'ABB101', source: 'local' });

    const res = await app.inject({ method: 'GET', url: '/api/articles?q=abb' });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((a: { itemCode: string }) => a.itemCode)).toEqual(['ABB101']);
    await app.close();
  });

  it('the path param wins over the body itemCode (no smuggling a different article)', async () => {
    const app = buildApp({ db: openDb(':memory:') });
    await app.inject({
      method: 'PUT',
      url: '/api/articles/REAL',
      payload: { itemCode: 'FAKE', name: 'n', rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } },
    });
    const res = await app.inject({ method: 'GET', url: '/api/articles?q=' });
    expect(res.json().map((a: { itemCode: string }) => a.itemCode)).toEqual(['REAL']);
    await app.close();
  });
});
