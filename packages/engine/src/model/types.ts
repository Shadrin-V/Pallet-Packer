// Domain types (api-contract.md 0.1.0). All linear dimensions and coordinates are integer
// millimetres (ADR 002); coordinates are measured from the cargo-hold corner.

import type { RotationRule, NestingState, NestingMode, Orientation, LoadingMode } from './constants';

/** Optimisation objective. MVP supports only `maxUnits`. */
export type Objective = 'maxUnits';

export interface Vehicle {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  /** kg; optional, not enforced in the MVP. */
  maxPayload?: number;
}

export interface CargoStacking {
  stackable: boolean;
  maxTiers?: number;
}

export interface CargoNesting {
  nestable: boolean;
  /** sequential → Δh (height per nested unit); pairwise → h_д (height of the two top boards), mm. */
  stepHeight?: number;
  maxNested?: number;
  /** How units nest; default 'sequential' (ADR 009). */
  nestingMode?: NestingMode;
  /** pairwise only: allow one unpaired pallet on top; default false. */
  allowUnpairedTop?: boolean;
}

export interface CargoType {
  id: string;
  name: string;
  length: number;
  width: number;
  /** Height of the base unit, mm. */
  height: number;
  /** Requested count; ignored when `fill` is true. */
  quantity: number;
  /** true → place as many as possible. */
  fill?: boolean;
  rotation: RotationRule;
  stacking: CargoStacking;
  nesting: CargoNesting;
  state: NestingState;
  /** Order ID this cargo belongs to; optional, api-contract 0.4.0. */
  orderId?: string;
  /** kg; optional, unused in the MVP. */
  weightPerUnit?: number;
}

export interface Load {
  vehicle: Vehicle;
  cargo: CargoType[];
  /** Uniform gap, mm; default 0. */
  clearance?: number;
  /** Loading mode for the vehicle; api-contract 0.4.0. */
  loadingMode?: LoadingMode;
  objective?: Objective;
}

export interface Placement {
  cargoTypeId: string;
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  /** Tier index, 1 = bottom. */
  tier: number;
  state: NestingState;
}

export interface UnplacedCount {
  cargoTypeId: string;
  count: number;
}

export interface LayoutMetrics {
  totalPlaced: number;
  usedFloorPositions: number;
  /** 0..100 */
  floorFillPercent: number;
  /** 0..100 */
  volumeFillPercent: number;
}

export interface Layout {
  placements: Placement[];
  unplaced: UnplacedCount[];
  metrics: LayoutMetrics;
  contractVersion: string;
  /** Non-empty → input failed validation and this layout is empty (api-contract 0.5.0). */
  errors?: EngineError[];
}

export interface ReportPerType {
  cargoTypeId: string;
  requested: number;
  placed: number;
  unplaced: number;
}

export interface Report {
  layout: Layout;
  perType: ReportPerType[];
}

/** Validation/engine error. Human-readable text is produced by the UI via @shadrin-v/i18n. */
export interface EngineError {
  code: string;
  details?: Record<string, unknown>;
}
