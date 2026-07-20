// The single seam through which the SPA reads/writes data (ADR 015 B→A migration boundary).
// In variant B this is implemented over HTTP to apps/server; in variant A over Frappe.
// Screens depend only on this interface — never on fetch/SQLite/ERPNext directly.
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

export interface DataProvider {
  listVehicles(): Promise<Vehicle[]>;
  upsertVehicle(v: Vehicle): Promise<Vehicle>;
  saveLoadingPlan(p: LoadingPlanInput): Promise<LoadingPlan>;
  listLoadingPlans(): Promise<LoadingPlanSummary[]>;
  getLoadingPlan(id: string): Promise<LoadingPlan>;
  importOrder(erpOrderId: string): Promise<OrderZone>;
  searchOrders(query: string): Promise<OrderRef[]>;
  searchArticles(query: string): Promise<Article[]>;
  upsertArticle(a: ArticleInput): Promise<Article>;
}
