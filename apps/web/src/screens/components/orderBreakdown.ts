// Per-order breakdown for the Ladeplan legend: which order holds how much of what (name × placed,
// plus unplaced). Pure join of the engine Layout (placements/unplaced by cargoTypeId) onto the
// Load's cargo list (name, orderId). Order-of-appearance matches orderIndexMap (palette colour).
import type { Layout, Load } from '@shadrin-v/engine';
import { orderIndexMap } from './cutaway';

export interface BreakdownItem {
  cargoTypeId: string;
  name: string;
  /** Base unit dimensions (mm) — shown in the load-composition reference. */
  length: number;
  width: number;
  height: number;
  placed: number;
  unplaced: number;
}

export interface OrderBreakdown {
  orderId: string;
  /** Display/sort order = order-of-appearance in the plan (zone order). */
  index: number;
  /** Palette slot (colour + hatch series). Stable per order (Setup colorIndex) when a colour map is
   *  supplied; otherwise equals `index` (order-of-appearance). QA #2. */
  colorIndex: number;
  items: BreakdownItem[];
  placedTotal: number;
}

export function orderBreakdown(load: Load, layout: Layout, colors?: Map<string, number>): OrderBreakdown[] {
  const placedBy = new Map<string, number>();
  for (const p of layout.placements) {
    placedBy.set(p.cargoTypeId, (placedBy.get(p.cargoTypeId) ?? 0) + 1);
  }
  const unplacedBy = new Map<string, number>();
  for (const u of layout.unplaced) {
    unplacedBy.set(u.cargoTypeId, (unplacedBy.get(u.cargoTypeId) ?? 0) + u.count);
  }

  const oidx = orderIndexMap(load);
  const orders = new Map<string, OrderBreakdown>();
  for (const c of load.cargo) {
    const orderId = c.orderId ?? '';
    let entry = orders.get(orderId);
    if (!entry) {
      const index = oidx.get(orderId) ?? 0;
      entry = { orderId, index, colorIndex: colors?.get(orderId) ?? index, items: [], placedTotal: 0 };
      orders.set(orderId, entry);
    }
    const placed = placedBy.get(c.id) ?? 0;
    entry.items.push({
      cargoTypeId: c.id,
      name: c.name || c.id,
      length: c.length,
      width: c.width,
      height: c.height,
      placed,
      unplaced: unplacedBy.get(c.id) ?? 0,
    });
    entry.placedTotal += placed;
  }

  return [...orders.values()].sort((a, b) => a.index - b.index);
}
