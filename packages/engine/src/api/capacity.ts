import type { CargoType, Layout, Load, LoadingMode, Vehicle } from '../model/index';
import { calculateLayout } from './api';

/** Packing context for `maxUnitsInVehicle` — the same knobs a `Load` carries (api-contract 0.19.0). */
export interface CapacityOptions {
  loadingMode?: LoadingMode;
  /** Uniform gap, mm; default 0. */
  clearance?: number;
}

/** Room left for a single-type load (api-contract 0.19.0). */
export interface RoomLeft {
  cargoTypeId: string;
  /** Units of this type the vehicle takes at most (`maxUnitsInVehicle`). */
  max: number;
  /** Units of this type in the given (possibly hand-edited) layout. */
  placed: number;
  /** `max − placed`, always > 0 (otherwise `roomLeft` returns null). */
  free: number;
}

/**
 * How many units of `cargo` the vehicle takes at most under the type's own rules (rotation,
 * stacking, nesting, fork access). This is what the real packer places — one `calculateLayout`
 * call with `fill: true` — not a volume estimate. `quantity` and `orderId` are ignored; an input
 * that fails validation yields 0. Pure and deterministic; the input is not mutated.
 */
export function maxUnitsInVehicle(cargo: CargoType, vehicle: Vehicle, options: CapacityOptions = {}): number {
  const layout = calculateLayout({
    vehicle,
    cargo: [{ ...cargo, quantity: 0, fill: true, orderId: undefined }],
    loadingMode: options.loadingMode,
    clearance: options.clearance,
  });
  return layout.errors ? 0 : layout.metrics.totalPlaced;
}

/**
 * For a load of exactly one cargo type: the maximum, how many units sit in `layout` (counted from
 * the layout as given — it may have been edited by hand, so it is not recalculated), and how many
 * more fit. Returns null when the load holds ≠ 1 type or there is no room left (`free ≤ 0`).
 */
export function roomLeft(load: Load, layout: Layout): RoomLeft | null {
  if (load.cargo.length !== 1) return null;
  const [cargo] = load.cargo;
  const max = maxUnitsInVehicle(cargo, load.vehicle, {
    loadingMode: load.loadingMode,
    clearance: load.clearance,
  });
  const placed = layout.placements.filter((p) => p.cargoTypeId === cargo.id).length;
  const free = max - placed;
  return free > 0 ? { cargoTypeId: cargo.id, max, placed, free } : null;
}
