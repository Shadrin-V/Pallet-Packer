// Per-order breakdown for the Ladeplan legend: which order holds how much of what (name × placed,
// plus unplaced). Pure join of the engine Layout (placements/unplaced by cargoTypeId) onto the
// Load's cargo list (name, orderId). Order-of-appearance matches orderIndexMap (palette colour).
import type { Layout, Load } from '@shadrin-v/engine';
import { orderIndexMap } from './cutaway';

export interface BreakdownItem {
  cargoTypeId: string;
  name: string;
  placed: number;
  unplaced: number;
}

export interface OrderBreakdown {
  orderId: string;
  /** Palette index (colour + hatch series), = orderIndexMap order. */
  index: number;
  items: BreakdownItem[];
  placedTotal: number;
}

export function orderBreakdown(load: Load, layout: Layout): OrderBreakdown[] {
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
      entry = { orderId, index: oidx.get(orderId) ?? 0, items: [], placedTotal: 0 };
      orders.set(orderId, entry);
    }
    const placed = placedBy.get(c.id) ?? 0;
    entry.items.push({ cargoTypeId: c.id, name: c.name || c.id, placed, unplaced: unplacedBy.get(c.id) ?? 0 });
    entry.placedTotal += placed;
  }

  return [...orders.values()].sort((a, b) => a.index - b.index);
}
