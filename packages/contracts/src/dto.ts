// Shared API DTOs — the JSON contract between apps/web (DataProvider consumer) and apps/server.
// Domain types (Vehicle, Load, Layout) come from @shadrin-v/engine and are re-exported for convenience.
import type {
  Vehicle,
  Load,
  Layout,
  NestingState,
  NestingMode,
  RotationRule,
  ForkAccess,
  ForkAxis,
} from '@shadrin-v/engine';

/**
 * Provenance of a cargo position's dimensions:
 * - 'erpnext-field' — read from ERPNext custom fields custom_length_mm/width/height (Sales Order Item);
 * - 'manual' — not provided by ERPNext; the user enters the dimensions in the app.
 * "Needs input" is derived from empty dimensions, not from this tag (see the fields spec).
 */
export const DIMENSION_SOURCES = ['erpnext-field', 'manual'] as const;
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

/** Packing rules of an article — always local: ERPNext does not know them and never overwrites them. */
export interface ArticleRules {
  state: NestingState;
  nestingMode: NestingMode;
  rotation: RotationRule;
  maxNested?: number;
  maxTiers?: number;
  allowUnpairedTop?: boolean;
  forkAccess?: ForkAccess;
  forkAxis?: ForkAxis;
}

/** 'erp' — constructive fields come from ERPNext and are read-only; 'local' — entered in the app. */
export const ARTICLE_SOURCES = ['erp', 'local'] as const;
export type ArticleSource = (typeof ARTICLE_SOURCES)[number];

/**
 * A catalogue article. Dimensions (length, width, height) are locked in the UI once ERPNext
 * fills them; nesting increments and name remain locally editable. `undefined` means "not
 * filled in yet" — the user may enter it by hand, no error.
 */
export interface Article {
  itemCode: string;
  name: string;
  length?: number;
  width?: number;
  height?: number;
  /** Nesting increment when nesting pairwise = thickness of the top deck board. */
  nestStepPairwise?: number;
  /** Nesting increment when nesting one-into-one (sequential). */
  nestStepSequential?: number;
  rules: ArticleRules;
  source: ArticleSource;
  syncedAt?: string;
  updatedAt: string;
}

/** What the client sends to PUT /api/articles/:itemCode — the server stamps source/updatedAt. */
export type ArticleInput = Omit<Article, 'source' | 'syncedAt' | 'updatedAt'>;

export type { Vehicle, Load, Layout };
