// ERPNext REST adapter (variant B). Reads Sales Orders and maps them to packing zones.
// Dimensions come from custom fields custom_length_mm/width/height on the Sales Order Item line
// (populated via fetch_from Item). No name parsing — see the ERPNext dimension fields spec.
import type { OrderZone, OrderPosition, OrderRef } from '@shadrin-v/contracts';

/** The order-source port the routes depend on (ErpNextAdapter implements it; tests fake it). */
export interface OrderSource {
  importOrder(orderId: string): Promise<OrderZone>;
  searchOrders(query: string): Promise<OrderRef[]>;
}

export interface ErpNextConfig {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  fetchImpl?: typeof fetch;
}

/** Shape of a Sales Order Item line we consume (extra ERPNext fields are ignored). */
interface SalesOrderItem {
  item_code: string;
  item_name: string;
  qty: number;
  custom_length_mm?: number;
  custom_width_mm?: number;
  custom_height_mm?: number;
}

export class ErpNextAdapter {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: ErpNextConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    return { Authorization: `token ${this.cfg.apiKey}:${this.cfg.apiSecret}` };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(this.cfg.baseUrl + path, { headers: this.headers() });
    if (!res.ok) {
      const err = new Error(`ERPNext responded ${res.status}`) as Error & { code: string };
      err.code = 'ERR_ERPNEXT_HTTP';
      throw err;
    }
    return res.json() as Promise<T>;
  }

  /** Fetch a Sales Order and map it to a packing zone (orderId + positions). */
  async importOrder(orderId: string): Promise<OrderZone> {
    const body = await this.get<{ data: { name: string; items: SalesOrderItem[] } }>(
      `/api/resource/Sales Order/${orderId}`,
    );
    const positions = body.data.items.map((item) => toPosition(item));
    return { orderId: body.data.name, positions };
  }

  /** Search Sales Orders by name fragment → lightweight refs. */
  async searchOrders(query: string): Promise<OrderRef[]> {
    const filters = encodeURIComponent(JSON.stringify([['name', 'like', `%${query}%`]]));
    const fields = encodeURIComponent(JSON.stringify(['name', 'customer_name']));
    const body = await this.get<{ data: Array<{ name: string; customer_name?: string }> }>(
      `/api/resource/Sales Order?filters=${filters}&fields=${fields}`,
    );
    return body.data.map((o) => ({ orderId: o.name, customer: o.customer_name }));
  }
}

/** All three custom dimensions present and positive → trusted; otherwise the user enters them. */
function toPosition(item: SalesOrderItem): OrderPosition {
  const l = item.custom_length_mm;
  const w = item.custom_width_mm;
  const h = item.custom_height_mm;
  const complete = isPositive(l) && isPositive(w) && isPositive(h);
  const base = { itemCode: item.item_code, itemName: item.item_name, quantity: item.qty };
  return complete
    ? { ...base, length: l, width: w, height: h, dimensionsSource: 'erpnext-field' }
    : { ...base, dimensionsSource: 'manual' };
}

function isPositive(n: number | undefined): n is number {
  return typeof n === 'number' && n > 0;
}
