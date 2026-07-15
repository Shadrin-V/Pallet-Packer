// Manual stack move for the top-view cutaway. Pure over Layout: translate every placement of one
// floor stack, snap to a grid, then re-validate. The geometry invariant is enforced here — an
// overlapping/out-of-bounds move is REJECTED (returns the original layout unchanged).
//
// Note: findGeometryViolations intentionally skips same-(cargoTypeId,x,y) pairs (one column/stack),
// so it alone would NOT catch dropping a stack onto another stack of the same type. We therefore add
// an explicit footprint-overlap check against every other stack.
import { findGeometryViolations, orientedDims, type Layout, type Load, type Placement } from '@shadrin-v/engine';

export const SNAP_MM = 100;

/** Snap a mm value to the grid. */
export function snap(v: number, grid = SNAP_MM): number {
  return Math.round(v / grid) * grid;
}

/** Half-open interval overlap (touching edges do not overlap). */
function overlaps1d(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

export interface StackSel {
  cargoTypeId: string;
  x: number;
  y: number;
}

/**
 * Move the stack at (sel.x, sel.y) to snapped (toX, toY). Returns a new Layout iff the result has no
 * geometry violations and no footprint overlap with another stack; otherwise returns the ORIGINAL
 * layout (reject). Metrics are unchanged — repositioning a stack does not change the placed count.
 */
export function moveStack(load: Load, layout: Layout, sel: StackSel, toX: number, toY: number): Layout {
  const nx = snap(toX);
  const ny = snap(toY);
  if (nx === sel.x && ny === sel.y) return layout;

  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  const isSel = (p: Placement) => p.cargoTypeId === sel.cargoTypeId && p.x === sel.x && p.y === sel.y;

  const selected = layout.placements.filter(isSel);
  if (selected.length === 0) return layout;

  const selCargo = byId.get(sel.cargoTypeId);
  if (!selCargo) return layout;
  const [dx, dy] = orientedDims(selCargo.length, selCargo.width, selCargo.height, selected[0].orientation);

  // Footprint overlap with any OTHER stack (same or different cargo type) → reject.
  const overlapsOther = layout.placements.some((o) => {
    if (isSel(o)) return false;
    const oc = byId.get(o.cargoTypeId);
    if (!oc) return false;
    const [odx, ody] = orientedDims(oc.length, oc.width, oc.height, o.orientation);
    return overlaps1d(nx, nx + dx, o.x, o.x + odx) && overlaps1d(ny, ny + dy, o.y, o.y + ody);
  });
  if (overlapsOther) return layout;

  const placements = layout.placements.map((p) => (isSel(p) ? { ...p, x: nx, y: ny } : p));
  const moved: Layout = { ...layout, placements };

  // Out-of-bounds / orientation guard.
  return findGeometryViolations(load, moved).length === 0 ? moved : layout;
}
