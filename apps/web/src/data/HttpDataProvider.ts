// Variant-B DataProvider: talks HTTP to apps/server. Injectable fetch for testing.
import type {
  Vehicle,
  OrderZone,
  OrderRef,
  LoadingPlan,
  LoadingPlanInput,
  LoadingPlanSummary,
  Article,
  ArticleInput,
} from '@shadrin-v/contracts';
import type { DataProvider } from './DataProvider';

type Fetch = typeof fetch;

export class HttpDataProvider implements DataProvider {
  constructor(
    private readonly base = '',
    // Bound on purpose: browsers require `window` as the receiver of `fetch`, and a bare
    // `this.fetchImpl(...)` would hand them the provider instead (LKWkalk-7wb).
    private readonly fetchImpl: Fetch = (...args) => globalThis.fetch(...args),
  ) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(this.base + path, { method: 'GET', ...init });
    if (!res.ok) {
      const body = await res
        .json()
        .catch(() => ({ code: 'ERR_HTTP', details: { status: res.status } }));
      throw body;
    }
    return res.json() as Promise<T>;
  }

  private json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  }

  listVehicles() {
    return this.req<Vehicle[]>('/api/vehicles');
  }
  upsertVehicle(v: Vehicle) {
    return this.req<Vehicle>('/api/vehicles', this.json('PUT', v));
  }
  saveLoadingPlan(p: LoadingPlanInput) {
    return this.req<LoadingPlan>('/api/plans', this.json('POST', p));
  }
  listLoadingPlans() {
    return this.req<LoadingPlanSummary[]>('/api/plans');
  }
  getLoadingPlan(id: string) {
    return this.req<LoadingPlan>(`/api/plans/${encodeURIComponent(id)}`);
  }
  importOrder(erpOrderId: string) {
    return this.req<OrderZone>(`/api/orders/${encodeURIComponent(erpOrderId)}`);
  }
  searchOrders(query: string) {
    return this.req<OrderRef[]>(`/api/orders?q=${encodeURIComponent(query)}`);
  }
  searchArticles(query: string) {
    return this.req<Article[]>(`/api/articles?q=${encodeURIComponent(query)}`);
  }
  upsertArticle(a: ArticleInput) {
    return this.req<Article>(`/api/articles/${encodeURIComponent(a.itemCode)}`, this.json('PUT', a));
  }
}
