import type { CargoType, Placement } from '../model/index';

/** Per-tier placements for one floor column. dz = H (entschachtelt) or stepHeight (nested). */
export function columnPlacements(
  cargo: CargoType,
  x: number,
  y: number,
  orientation: Placement['orientation'],
  units: number,
): Placement[] {
  const dz =
    cargo.state === 'entschachtelt' ? cargo.height : (cargo.nesting.stepHeight ?? cargo.height);
  const out: Placement[] = [];
  for (let t = 0; t < units; t++) {
    out.push({
      cargoTypeId: cargo.id,
      x,
      y,
      z: t * dz,
      orientation,
      tier: t + 1,
      state: cargo.state,
    });
  }
  return out;
}
