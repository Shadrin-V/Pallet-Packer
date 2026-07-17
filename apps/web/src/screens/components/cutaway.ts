// Pure geometry for the cutaway views. Rects come from the engine Layout + orientedDims — heights
// use z+dz (real stack height), NEVER tier counts (design-system §7).
import { orientedDims, type Layout, type Load, type Orientation } from '@shadrin-v/engine';
import { orderColorToken } from '../../lib/orderColor';

export interface CutRect {
  x: number;
  y: number;
  w: number;
  h: number;
  series: number;
  /** cargo type of this stack (for drag selection) */
  cargoTypeId: string;
  /** units in this stack (top view label ×N) */
  count?: number;
  /** the stack's own orientation — what a drag has to hand the engine to resolve a drop */
  orientation?: Orientation;
  /** side view only: depth rank of the stack at this x (0 = front row, larger = further back). */
  depth?: number;
  /** side view only: the stack's floor y (across the width) — the source of `depth`. */
  rowY?: number;
}

/** Map each orderId to its palette index (order of first appearance). */
export function orderIndexMap(load: Load): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of load.cargo) {
    const oid = c.orderId ?? '';
    if (!map.has(oid)) map.set(oid, map.size);
  }
  return map;
}

interface CargoInfo {
  l: number;
  w: number;
  h: number;
  series: number;
}

/** Palette slot per orderId: a caller-supplied stable map (Setup colorIndex) wins, so an order keeps
 *  its colour when the list is reordered; otherwise fall back to order-of-appearance (QA #2). */
function cargoInfoMap(load: Load, colors?: Map<string, number>): Map<string, CargoInfo> {
  const slots = colors ?? orderIndexMap(load);
  const m = new Map<string, CargoInfo>();
  for (const c of load.cargo) {
    m.set(c.id, {
      l: c.length,
      w: c.width,
      h: c.height,
      series: orderColorToken(slots.get(c.orderId ?? '') ?? 0).series,
    });
  }
  return m;
}

/** Top view (Draufsicht): one footprint rect per floor position, with the stack count. */
export function topRects(load: Load, layout: Layout, colors?: Map<string, number>): CutRect[] {
  const info = cargoInfoMap(load, colors);
  const byPos = new Map<string, CutRect>();
  for (const p of layout.placements) {
    const c = info.get(p.cargoTypeId);
    if (!c) continue;
    const [dx, dy] = orientedDims(c.l, c.w, c.h, p.orientation);
    const key = `${p.cargoTypeId}:${p.x}:${p.y}`;
    const existing = byPos.get(key);
    if (existing) existing.count = (existing.count ?? 1) + 1;
    else byPos.set(key, { x: p.x, y: p.y, w: dx, h: dy, series: c.series, cargoTypeId: p.cargoTypeId, count: 1, orientation: p.orientation });
  }
  return [...byPos.values()];
}

/** Half-open interval overlap (touching edges do not overlap) — the engine's rule, edit.ts. */
const overlaps1d = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Side view (Seitenansicht): one silhouette bar per floor stack (grouped by x,y), its height = that
 * stack's top (max z+dz). Stacks whose x INTERVALS overlap hide one another in the projection;
 * `depth` counts how many stand in front of this one, so the renderer can dim what is genuinely
 * behind something — and leave alone what merely shares a row with it.
 */
export function sideRects(load: Load, layout: Layout, vehicleHeight: number, colors?: Map<string, number>): CutRect[] {
  const info = cargoInfoMap(load, colors);
  const byPos = new Map<string, { x: number; y: number; top: number; w: number; series: number; cargoTypeId: string }>();
  for (const p of layout.placements) {
    const c = info.get(p.cargoTypeId);
    if (!c) continue;
    const [dx, , dz] = orientedDims(c.l, c.w, c.h, p.orientation);
    const top = p.z + dz;
    const key = `${p.x}:${p.y}`;
    const cur = byPos.get(key);
    if (!cur || top > cur.top) byPos.set(key, { x: p.x, y: p.y, top, w: dx, series: c.series, cargoTypeId: p.cargoTypeId });
  }
  const stacks = [...byPos.values()];
  // Depth = how many stacks actually hide this one: they overlap it IN THE PROJECTION (by the x
  // interval — not by an equal x, which is what the side view collapses) and stand nearer the viewer.
  // Convention: the viewer is at y = width looking towards y = 0, so a LARGER y is nearer.
  // depth 0 therefore means "nothing is in front of this stack" — an isolated stack in a rear row is
  // no longer dimmed for company it does not keep.
  const hiddenBy = (s: (typeof stacks)[number]) =>
    stacks.filter((o) => o !== s && o.y > s.y && overlaps1d(s.x, s.x + s.w, o.x, o.x + o.w)).length;
  return stacks.map((s) => ({
    x: s.x,
    y: vehicleHeight - s.top,
    w: s.w,
    h: s.top,
    series: s.series,
    cargoTypeId: s.cargoTypeId,
    depth: hiddenBy(s),
    rowY: s.y,
  }));
}
