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

/**
 * 'erp' — this article has been synced from ERPNext at least once; 'local' — created in the app
 * and never synced. This is provenance of the *record*, not of any individual field: an 'erp'
 * article can still have dimensions the user is free to edit (see `Article` below) — whether a
 * given constructive field is locked is decided per field on the server, not by this flag alone.
 */
export const ARTICLE_SOURCES = ['erp', 'local'] as const;
export type ArticleSource = (typeof ARTICLE_SOURCES)[number];

/** The fields ERPNext is able to supply for an article. `name` included: ERPNext owns it. */
export const ARTICLE_ERP_FIELDS = ['length', 'width', 'height', 'name'] as const;
export type ArticleErpField = (typeof ARTICLE_ERP_FIELDS)[number];

/**
 * A catalogue article. A constructive field (length, width, height) is locked in the UI only when
 * ERPNext actually supplied a value for *that field* on this article — never inferred from
 * `source` or from the field merely being non-empty. A field ERPNext has left blank accepts the
 * user's value with no error and stays editable indefinitely, including after being filled once;
 * correcting it a second time must not be silently discarded. Nesting increments are never
 * supplied by ERPNext, so they are always locally editable regardless of `source`. A name ERPNext
 * supplied is locked like any other supplied field, and is changed in ERPNext only (ADR 022).
 * `undefined` means "not filled in yet" — the user may enter it by hand, no error.
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
  /**
   * Which fields ERPNext actually supplied for this article (dimensions and, per ADR 022, `name`)
   * — these and only these are locked against local edits; a field absent from this list is always
   * user-editable, even on an ERP-sourced article. The server decides this list; the client must
   * never re-derive it from `source` plus "value is present" (that inference is wrong: see the
   * `Article` doc above). Always present, defaulting to an empty array for articles ERPNext has
   * never touched.
   */
  erpFields: readonly ArticleErpField[];
}

/** What the client sends to PUT /api/articles/:itemCode — the server stamps source/syncedAt/updatedAt/erpFields. */
export type ArticleInput = Omit<Article, 'source' | 'syncedAt' | 'updatedAt' | 'erpFields'>;

export type { Vehicle, Load, Layout };
