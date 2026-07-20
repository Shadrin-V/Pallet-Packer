import { describe, it, expect, vi } from 'vitest';
import { HttpDataProvider } from './HttpDataProvider';

describe('HttpDataProvider', () => {
  it('GET /api/vehicles → listVehicles', async () => {
    const vehicles = [{ id: 'v1', name: 'LKW', length: 13600, width: 2480, height: 2700 }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(vehicles), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.listVehicles()).resolves.toEqual(vehicles);
    expect(fetchMock).toHaveBeenCalledWith('/api/vehicles', expect.objectContaining({ method: 'GET' }));
  });

  it('PUT /api/vehicles serializes the body as JSON', async () => {
    const v = { id: 'v2', name: 'Sprinter', length: 4300, width: 1780, height: 1900 };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(v), { status: 200 }));
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.upsertVehicle(v)).resolves.toEqual(v);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/vehicles',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(v) }),
    );
  });

  it('encodes path params for getLoadingPlan and importOrder', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const dp = new HttpDataProvider('', fetchMock);
    await dp.importOrder('SO-2026/07');
    expect(fetchMock).toHaveBeenCalledWith('/api/orders/SO-2026%2F07', expect.anything());
  });

  it('throws the ApiError body on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 'ERR_NOT_FOUND' }), { status: 404 }),
    );
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.getLoadingPlan('nope')).rejects.toMatchObject({ code: 'ERR_NOT_FOUND' });
  });

  it('applies a base URL when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    const dp = new HttpDataProvider('https://host', fetchMock);
    await dp.searchOrders('pal');
    expect(fetchMock).toHaveBeenCalledWith('https://host/api/orders?q=pal', expect.anything());
  });

  it('GET /api/articles?q= → searchArticles', async () => {
    const articles = [{ itemCode: 'ABB101', name: 'Palette', rules: {}, source: 'local', updatedAt: 'x' }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(articles), { status: 200 }));
    const dp = new HttpDataProvider('', fetchMock);
    await expect(dp.searchArticles('abb 1')).resolves.toEqual(articles);
    expect(fetchMock).toHaveBeenCalledWith('/api/articles?q=abb%201', expect.objectContaining({ method: 'GET' }));
  });

  it('PUT /api/articles/:itemCode encodes the code and sends the body', async () => {
    const a = { itemCode: 'A/1', name: 'n', rules: { state: 'entschachtelt', nestingMode: 'pairwise', rotation: 'yawOnly' } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(a), { status: 200 }));
    const dp = new HttpDataProvider('', fetchMock);
    await dp.upsertArticle(a as never);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/articles/A%2F1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(a) }),
    );
  });
});
