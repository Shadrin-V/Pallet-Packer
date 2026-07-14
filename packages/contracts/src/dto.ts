// Shared API DTOs — the JSON contract between apps/web (DataProvider consumer) and apps/server.
// Domain types (Vehicle, Load, Layout) come from @shadrin-v/engine and are re-exported for convenience.
import type { Vehicle, Load, Layout } from '@shadrin-v/engine';

/** Where a cargo position's dimensions came from (provenance for the fallback-parsing flow). */
export const DIMENSION_SOURCES = ['erpnext-field', 'parsed-name', 'manual', 'unknown'] as const;
export type DimensionSource = (typeof DIMENSION_SOURCES)[number];

/** One line of an imported order. Dimensions are mm; undefined → needs manual entry. */
export interface OrderPosition {
  itemCode: string;
  itemName: string;
  quantity: number;
  length?: number;
  width?: number;
  height?: number;
  dimensionsSource: DimensionSource;
}

/** An imported ERPNext Sales Order mapped to a packing zone (engine groups cargo by orderId). */
export interface OrderZone {
  orderId: string;
  positions: OrderPosition[];
}

/** Lightweight order reference for search/autocomplete. */
export interface OrderRef {
  orderId: string;
  customer?: string;
}

/** Input to persist a loading plan; the server computes the Layout snapshot from `load`. */
export interface LoadingPlanInput {
  name: string;
  load: Load;
  erpnextOrderIds: string[];
  notes?: string;
}

/** Row for the saved-plans list. */
export interface LoadingPlanSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** A saved plan: reproducible snapshot of input Load + computed Layout + order references. */
export interface LoadingPlan extends LoadingPlanSummary {
  load: Load;
  layout: Layout;
  erpnextOrderIds: string[];
  notes?: string;
}

/** Error envelope returned by the API on non-2xx (mirrors engine EngineError shape). */
export interface ApiError {
  code: string;
  details?: Record<string, unknown>;
}

export type { Vehicle, Load, Layout };
