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
  /** units in this stack (top view label ×N) */
  count?: number;
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
    else byPos.set(key, { x: p.x, y: p.y, w: dx, h: dy, series: c.series, count: 1 });
  }
  return [...byPos.values()];
}

/** Side view (Seitenansicht): one rect per unit, y = vehicleHeight − (z + dz). */
export function sideRects(load: Load, layout: Layout, vehicleHeight: number): CutRect[] {
  const info = cargoInfoMap(load);
  const rects: CutRect[] = [];
  for (const p of layout.placements) {
    const c = info.get(p.cargoTypeId);
    if (!c) continue;
    const [dx, , dz] = orientedDims(c.l, c.w, c.h, p.orientation);
    rects.push({ x: p.x, y: vehicleHeight - (p.z + dz), w: dx, h: dz, series: c.series });
  }
  return rects;
}
