import { describe, it, expect, vi } from 'vitest';
import { ErpNextAdapter } from './adapter';

const CFG = { baseUrl: 'https://erp.example', apiKey: 'KEY', apiSecret: 'SECRET' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ErpNextAdapter.importOrder', () => {
  it('reads dimensions from custom_*_mm on the order line (erpnext-field)', async () => {
    const salesOrder = {
      data: {
        name: 'SAL-ORD-2026-00001',
        customer_name: 'Zöllner-Wiethoff GmbH',
        items: [
          {
            item_code: 'ABB101',
            item_name: 'Einweg-Holzpalette 600x800 mm IPPC + KD',
            qty: 10,
            custom_length_mm: 600,
            custom_width_mm: 800,
            custom_height_mm: 144,
          },
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(salesOrder));
    const adapter = new ErpNextAdapter({ ...CFG, fetchImpl: fetchMock });

    const zone = await adapter.importOrder('SAL-ORD-2026-00001');
    expect(zone).toEqual({
      orderId: 'SAL-ORD-2026-00001',
      positions: [
        {
          itemCode: 'ABB101',
          itemName: 'Einweg-Holzpalette 600x800 mm IPPC + KD',
          quantity: 10,
          length: 600,
          width: 800,
          height: 144,
          dimensionsSource: 'erpnext-field',
        },
      ],
    });
  });

  it('marks a position manual when custom fields are absent (no name parsing)', async () => {
    const salesOrder = {
      data: {
        name: 'SO-2',
        items: [{ item_code: 'X', item_name: 'Palette 1200x800 mm', qty: 4 }],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(salesOrder));
    const adapter = new ErpNextAdapter({ ...CFG, fetchImpl: fetchMock });

    const zone = await adapter.importOrder('SO-2');
    expect(zone.positions[0]).toEqual({
      itemCode: 'X',
      itemName: 'Palette 1200x800 mm',
      quantity: 4,
      dimensionsSource: 'manual',
    });
    expect(zone.positions[0].length).toBeUndefined();
  });

  it('treats a partial/zero custom dimension as manual (all three required, > 0)', async () => {
    const salesOrder = {
      data: {
        name: 'SO-3',
        items: [
          { item_code: 'Y', item_name: 'X', qty: 1, custom_length_mm: 600, custom_width_mm: 0, custom_height_mm: 100 },
        ],
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(salesOrder));
    const adapter = new ErpNextAdapter({ ...CFG, fetchImpl: fetchMock });

    const zone = await adapter.importOrder('SO-3');
    expect(zone.positions[0].dimensionsSource).toBe('manual');
    expect(zone.positions[0].width).toBeUndefined();
  });

  it('sends token auth and hits the Sales Order resource URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { name: 'SO-1', items: [] } }));
    const adapter = new ErpNextAdapter({ ...CFG, fetchImpl: fetchMock });
    await adapter.importOrder('SAL-ORD-2026-00001');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://erp.example/api/resource/Sales Order/SAL-ORD-2026-00001');
    expect((init.headers as Record<string, string>).Authorization).toBe('token KEY:SECRET');
  });

  it('throws ERR_ERPNEXT_HTTP on a non-2xx ERPNext response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: 'not found' }, 404));
    const adapter = new ErpNextAdapter({ ...CFG, fetchImpl: fetchMock });
    await expect(adapter.importOrder('nope')).rejects.toMatchObject({ code: 'ERR_ERPNEXT_HTTP' });
  });
});

describe('ErpNextAdapter.searchOrders', () => {
  it('maps the resource list to OrderRefs', async () => {
    const list = {
      data: [
        { name: 'SAL-ORD-2026-00001', customer_name: 'Zöllner-Wiethoff GmbH' },
        { name: 'SAL-ORD-2026-00002', customer_name: 'Zöllner-Wiethoff GmbH' },
      ],
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(list));
    const adapter = new ErpNextAdapter({ ...CFG, fetchImpl: fetchMock });

    const refs = await adapter.searchOrders('2026');
    expect(refs).toEqual([
      { orderId: 'SAL-ORD-2026-00001', customer: 'Zöllner-Wiethoff GmbH' },
      { orderId: 'SAL-ORD-2026-00002', customer: 'Zöllner-Wiethoff GmbH' },
    ]);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/resource/Sales Order');
  });
});
