// Manual layout edits for the top-view cutaway (move + yaw rotate). Pure over Layout: change every
// placement of one floor stack, then re-validate. The geometry invariant is enforced here — an
// overlapping/out-of-bounds edit is REJECTED (returns the original layout unchanged).
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

/** Does the footprint (nx, ny, dx, dy) overlap any stack other than the selected one? */
function overlapsOtherStack(
  load: Load,
  layout: Layout,
  isSel: (p: Placement) => boolean,
  nx: number,
  ny: number,
  dx: number,
  dy: number,
): boolean {
  const byId = new Map(load.cargo.map((c) => [c.id, c]));
  return layout.placements.some((o) => {
    if (isSel(o)) return false;
    const oc = byId.get(o.cargoTypeId);
    if (!oc) return false;
    const [odx, ody] = orientedDims(oc.length, oc.width, oc.height, o.orientation);
    return overlaps1d(nx, nx + dx, o.x, o.x + odx) && overlaps1d(ny, ny + dy, o.y, o.y + ody);
  });
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
  if (overlapsOtherStack(load, layout, isSel, nx, ny, dx, dy)) return layout;

  const placements = layout.placements.map((p) => (isSel(p) ? { ...p, x: nx, y: ny } : p));
  const moved: Layout = { ...layout, placements };

  // Out-of-bounds / orientation guard.
  return findGeometryViolations(load, moved).length === 0 ? moved : layout;
}

/** The yaw counterpart of an orientation, or null if it is not a floor (yaw) orientation. */
function yawFlip(o: Placement['orientation']): 'lwh' | 'wlh' | null {
  return o === 'lwh' ? 'wlh' : o === 'wlh' ? 'lwh' : null;
}

/**
 * Rotate the stack at (sel.x, sel.y) by 90° about the vertical axis (lwh ↔ wlh), anchored at its
 * (x, y) corner. Returns a new Layout iff the rotated footprint stays clear of other stacks and
 * inside the hold; otherwise returns the ORIGINAL layout (reject).
 *
 * Yaw only, per ADR 013: the MVP packer places only the yaw subset, and tipping onto a face changes
 * dz — which would invalidate the z of every tier above and require recomputing the stack, not a
 * manual edit. `rotation: 'none'` positions are refused outright.
 */
export function rotateStack(load: Load, layout: Layout, sel: StackSel): Layout {
  const isSel = (p: Placement) => p.cargoTypeId === sel.cargoTypeId && p.x === sel.x && p.y === sel.y;
  const selected = layout.placements.filter(isSel);
  if (selected.length === 0) return layout;

  const selCargo = load.cargo.find((c) => c.id === sel.cargoTypeId);
  if (!selCargo || selCargo.rotation === 'none') return layout;

  // A stack the MVP packer builds is uniform; a mixed or tipped column is not ours to rotate.
  const from = selected[0].orientation;
  const to = yawFlip(from);
  if (!to || selected.some((p) => p.orientation !== from)) return layout;

  const [dx, dy] = orientedDims(selCargo.length, selCargo.width, selCargo.height, to);
  if (overlapsOtherStack(load, layout, isSel, sel.x, sel.y, dx, dy)) return layout;

  const rotated: Layout = {
    ...layout,
    placements: layout.placements.map((p) => (isSel(p) ? { ...p, orientation: to } : p)),
  };
  // Out-of-bounds / rotation-rule guard.
  return findGeometryViolations(load, rotated).length === 0 ? rotated : layout;
}
