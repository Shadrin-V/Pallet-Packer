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
 * - 'manual' — not provided by ERPNext; the user enters the dimensions in the app;
 * - 'catalog' — from the ERP catalogue (DocType «Ladungsplaner Artikel»): confirmed by a human;
 * - 'name' — length and width suggested from the article name: a SUGGESTION, height is empty.
 * "Needs input" is derived from empty dimensions, not from this tag (see the fields spec).
 */
export const DIMENSION_SOURCES = ['erpnext-field', 'manual', 'catalog', 'name'] as const;
export type DimensionSource = (typeof DIMENSION_SOURCES)[number];

/** ERP API contract version the build is written against (docs: erp-y6tb9 api-vertrag). */
export const ERP_API_CONTRACT = 'erp-y6tb9-v1';

export const UNPLACEABLE_REASONS = [
  'ERR_LINE_UNIT_NOT_PIECES', // line unit is not a piece unit (e.g. m³) — not laid out by dimensions
  'ERR_LINE_QTY_UNKNOWN', // conversion to stock units unknown (no conversion_factor)
  'ERR_LINE_NO_ITEM', // line without an article
  'ERR_LINE_NOTHING_OPEN', // open remainder is 0
] as const;
export type UnplaceableReason = (typeof UNPLACEABLE_REASONS)[number];

/** One line of an imported order. Dimensions are mm; undefined → needs manual entry. */
export interface OrderPosition {
  itemCode: string;
  itemName: string;
  /** Whole number ≥ 0; 0 when `unplaceable`. */
  quantity: number;
  length?: number;
  width?: number;
  height?: number;
  dimensionsSource: DimensionSource;
  // --- ERP additions, all optional ---
  /** Name of the Purchase Order Item row. */
  lineRef?: string;
  /** Stock unit of the article — the unit `quantity` is given in. Piece-ness is decided by the server. */
  uom?: string;
  /** From the catalogue; when present the page MUST apply them to the position. */
  rules?: ArticleRules;
  nestStepPairwise?: number;
  nestStepSequential?: number;
  unplaceable?: UnplaceableReason;
  /**
   * Exact quantity in `uom`, may be fractional: for an unplaceable line (with `quantity: 0`) and for a
   * placeable one when the exact value differs from `quantity` (the server rounded `quantity` UP).
   */
  sourceQuantity?: number;
}

/** An imported ERPNext Sales Order / ERP Purchase Order mapped to a packing zone (engine groups cargo by orderId). */
export interface OrderZone {
  orderId: string;
  positions: OrderPosition[];
  /** Supplier name — the zone caption. */
  partner?: string;
  /** Customer name for a direct delivery. */
  customer?: string;
}

/** Who is logged in to the ERP page. */
export interface ErpSession {
  /** ERP login — the key isolating the browser draft. */
  user: string;
  fullName: string;
  language: 'de' | 'ru';
  csrfToken: string;
  /** schaefer_erp.__version__ */
  appVersion: string;
}

/** Positions of an existing trip. */
export interface TripImport {
  /** Name of the LKW-Disposition. */
  tripId: string;
  /** ISO date (verladung_am). */
  loadingDate?: string;
  /** Grouped by Purchase Order, in trip order. */
  zones: OrderZone[];
}

/** An open Purchase Order line offered for selection. */
export interface OpenLine {
  lineRef: string;
  orderId: string;
  supplier?: string;
  customer?: string;
  itemCode: string;
  itemName: string;
  /** Open remainder in stock units; null — unknown. */
  openQuantity: number | null;
  uom: string;
  /** ISO date. */
  dueDate?: string;
  placeable: boolean;
  /** Present ⇔ placeable === false. */
  reason?: UnplaceableReason;
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
 * article can still have dimensions (and, per ADR 022, a name) the user is free to edit (see
 * `Article` below) — whether a given field is locked is decided per field on the server, not by
 * this flag alone.
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
