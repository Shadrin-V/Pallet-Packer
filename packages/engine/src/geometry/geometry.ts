import type { Layout, Load, Placement } from '../model/index';
import { allowedOrientations, orientedDims } from '../model/orientation';

export interface GeometryViolation {
  kind: 'out-of-bounds' | 'overlap' | 'orientation';
  details: Record<string, unknown>;
}

/** Half-open interval overlap: touching edges do not count as overlapping. */
function overlaps1d(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

interface Box {
  p: Placement;
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Check a layout's geometry against a load (qrd.9). Returns one violation per problem:
 * out-of-bounds, overlap, or an orientation the cargo's rotation rule forbids.
 * Used in property tests and as an optional dev-mode self-check of the engine.
 */
export function findGeometryViolations(load: Load, layout: Layout): GeometryViolation[] {
  const violations: GeometryViolation[] = [];
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const { vehicle } = load;
  const boxes: Box[] = [];

  for (const p of layout.placements) {
    const c = byId.get(p.cargoTypeId);
    if (c === undefined) continue;
    const [dx, dy, dz] = orientedDims(c.length, c.width, c.height, p.orientation);
    boxes.push({ p, dx, dy, dz });

    if (!allowedOrientations(c.rotation).includes(p.orientation)) {
      violations.push({
        kind: 'orientation',
        details: { cargoTypeId: c.id, orientation: p.orientation, rotation: c.rotation },
      });
    }

    if (
      p.x < 0 ||
      p.y < 0 ||
      p.z < 0 ||
      p.x + dx > vehicle.length ||
      p.y + dy > vehicle.width ||
      p.z + dz > vehicle.height
    ) {
      violations.push({
        kind: 'out-of-bounds',
        details: { cargoTypeId: c.id, x: p.x, y: p.y, z: p.z, dx, dy, dz },
      });
    }
  }

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.p.x === b.p.x && a.p.y === b.p.y && a.p.cargoTypeId === b.p.cargoTypeId) continue;
      if (
        overlaps1d(a.p.x, a.p.x + a.dx, b.p.x, b.p.x + b.dx) &&
        overlaps1d(a.p.y, a.p.y + a.dy, b.p.y, b.p.y + b.dy) &&
        overlaps1d(a.p.z, a.p.z + a.dz, b.p.z, b.p.z + b.dz)
      ) {
        violations.push({ kind: 'overlap', details: { a: a.p.cargoTypeId, b: b.p.cargoTypeId } });
      }
    }
  }

  return violations;
}

/** Throw if the layout violates any geometry invariant. */
export function assertValidGeometry(load: Load, layout: Layout): void {
  const v = findGeometryViolations(load, layout);
  if (v.length > 0) {
    throw new Error(`Geometry violations: ${JSON.stringify(v)}`);
  }
}
