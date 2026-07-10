import type { Layout, Load, Placement } from '../model/index';
import { orientedDims } from '../model/orientation';

export interface FillMetrics {
  /** Occupied floor area / hold floor area, 0..100. */
  floorFillPercent: number;
  /** Occupied volume / hold volume, 0..100. */
  volumeFillPercent: number;
}

/**
 * Fill metrics for a packed layout (qrd.8).
 *
 * A *column* = placements sharing `cargoTypeId + x + y` (one 2.5D floor position). Each column
 * contributes its footprint once to the floor area, and its bounding box (footprint × column
 * height) once to the occupied volume. Column height is measured from the actual placements
 * (`max(z+unitHeight) − min(z)`), so a nested column occupies `H + (n−1)·Δh`, never `n·H`
 * (spec §11 invariant) — summing per-unit boxes would double-count nested overlap and can exceed
 * 100%, so we use the bounding box instead. Both percentages are 0..100 for a valid,
 * non-overlapping layout. Deterministic; no rounding.
 */
export function computeFillMetrics(load: Load, layout: Layout): FillMetrics {
  const { vehicle } = load;
  const floorArea = vehicle.length * vehicle.width;
  const holdVolume = floorArea * vehicle.height;
  if (floorArea <= 0 || holdVolume <= 0) {
    return { floorFillPercent: 0, volumeFillPercent: 0 };
  }

  const byId = new Map(load.cargo.map((c) => [c.id, c] as const));
  const columns = new Map<string, Placement[]>();
  for (const p of layout.placements) {
    const key = `${p.cargoTypeId}@${p.x},${p.y}`;
    const arr = columns.get(key);
    if (arr) arr.push(p);
    else columns.set(key, [p]);
  }

  let occupiedFloor = 0;
  let occupiedVolume = 0;
  for (const col of columns.values()) {
    const c = byId.get(col[0].cargoTypeId);
    if (c === undefined) continue;
    const [dx, dy] = orientedDims(c.length, c.width, c.height, col[0].orientation);
    const footprint = dx * dy;
    occupiedFloor += footprint;

    let top = -Infinity;
    let bottom = Infinity;
    for (const p of col) {
      const [, , dz] = orientedDims(c.length, c.width, c.height, p.orientation);
      top = Math.max(top, p.z + dz);
      bottom = Math.min(bottom, p.z);
    }
    occupiedVolume += footprint * (top - bottom);
  }

  return {
    floorFillPercent: (occupiedFloor / floorArea) * 100,
    volumeFillPercent: (occupiedVolume / holdVolume) * 100,
  };
}
