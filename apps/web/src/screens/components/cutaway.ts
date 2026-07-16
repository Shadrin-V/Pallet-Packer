// Pure geometry for the cutaway views. Rects come from the engine Layout + orientedDims — heights
// use z+dz (real stack height), NEVER tier counts (design-system §7).
import { orientedDims, type Layout, type Load } from '@shadrin-v/engine';
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

function cargoInfoMap(load: Load): Map<string, CargoInfo> {
  const oidx = orderIndexMap(load);
  const m = new Map<string, CargoInfo>();
  for (const c of load.cargo) {
    m.set(c.id, {
      l: c.length,
      w: c.width,
      h: c.height,
      series: orderColorToken(oidx.get(c.orderId ?? '') ?? 0).series,
    });
  }
  return m;
}

/** Top view (Draufsicht): one footprint rect per floor position, with the stack count. */
export function topRects(load: Load, layout: Layout): CutRect[] {
  const info = cargoInfoMap(load);
  const byPos = new Map<string, CutRect>();
  for (const p of layout.placements) {
    const c = info.get(p.cargoTypeId);
    if (!c) continue;
    const [dx, dy] = orientedDims(c.l, c.w, c.h, p.orientation);
    const key = `${p.cargoTypeId}:${p.x}:${p.y}`;
    const existing = byPos.get(key);
    if (existing) existing.count = (existing.count ?? 1) + 1;
    else byPos.set(key, { x: p.x, y: p.y, w: dx, h: dy, series: c.series, cargoTypeId: p.cargoTypeId, count: 1 });
  }
  return [...byPos.values()];
}

/**
 * Side view (Seitenansicht): one silhouette bar per floor stack (grouped by x,y), its height = that
 * stack's top (max z+dz). Stacks that share an x (rows across the width) overlap in the projection;
 * `depth` ranks them front→back so the renderer can dim the rear rows (depth > 0) and draw them
 * behind the front row — showing back-row loads instead of hiding them.
 */
export function sideRects(load: Load, layout: Layout, vehicleHeight: number): CutRect[] {
  const info = cargoInfoMap(load);
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
  // depth = rank of this stack's y among the stacks sharing its x.
  // Convention: the side view is taken from the BOTTOM edge of the top view (the viewer stands at
  // y = width looking towards y = 0). So the row with the LARGEST y is nearest the viewer → depth 0
  // (drawn last, full opacity); smaller y = further back → higher depth (drawn first, dimmed).
  const ysByX = new Map<number, number[]>();
  for (const s of stacks) {
    const arr = ysByX.get(s.x) ?? [];
    arr.push(s.y);
    ysByX.set(s.x, arr);
  }
  for (const arr of ysByX.values()) arr.sort((a, b) => b - a);
  return stacks.map((s) => ({
    x: s.x,
    y: vehicleHeight - s.top,
    w: s.w,
    h: s.top,
    series: s.series,
    cargoTypeId: s.cargoTypeId,
    depth: ysByX.get(s.x)!.indexOf(s.y),
    rowY: s.y,
  }));
}
