import { describe, it, expect } from 'vitest';
import type { Layout, Load, CargoType } from '@shadrin-v/engine';
import { orderBreakdown } from './orderBreakdown';

const cargo = (id: string, name: string, orderId: string): CargoType => ({
  id,
  name,
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: 10,
  rotation: 'none',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
  orderId,
});

const placement = (cargoTypeId: string) => ({
  cargoTypeId,
  x: 0,
  y: 0,
  z: 0,
  orientation: 'lwh' as const,
  tier: 1,
  state: 'entschachtelt' as const,
});

const load: Load = {
  vehicle: { id: 'v', name: 'LKW', length: 5000, width: 5000, height: 5000 },
  cargo: [cargo('a', 'EPAL 1', 'SO-1'), cargo('b', 'Gestell', 'SO-1'), cargo('c', 'Sonder', 'SO-2')],
};

describe('orderBreakdown', () => {
  it('groups placed/unplaced counts per order, in order-of-appearance', () => {
    const layout: Layout = {
      placements: [placement('a'), placement('a'), placement('a'), placement('b')],
      unplaced: [
        { cargoTypeId: 'b', count: 2 },
        { cargoTypeId: 'c', count: 5 },
      ],
      metrics: { totalPlaced: 4, usedFloorPositions: 4, floorFillPercent: 10, volumeFillPercent: 5 },
      contractVersion: '0.9.0',
    };
    const bd = orderBreakdown(load, layout);

    expect(bd.map((o) => o.orderId)).toEqual(['SO-1', 'SO-2']);
    expect(bd[0].index).toBe(0);
    expect(bd[1].index).toBe(1);

    // SO-1 has two positions: a (3 placed, 0 unplaced), b (1 placed, 2 unplaced)
    const dims = { length: 1000, width: 1000, height: 1000 };
    expect(bd[0].items).toEqual([
      { cargoTypeId: 'a', name: 'EPAL 1', ...dims, placed: 3, unplaced: 0 },
      { cargoTypeId: 'b', name: 'Gestell', ...dims, placed: 1, unplaced: 2 },
    ]);
    expect(bd[0].placedTotal).toBe(4);

    // SO-2: c nothing placed, 5 unplaced
    expect(bd[1].items).toEqual([{ cargoTypeId: 'c', name: 'Sonder', ...dims, placed: 0, unplaced: 5 }]);
    expect(bd[1].placedTotal).toBe(0);
  });

  it('colours by a provided stable map while keeping appearance display order (QA #2)', () => {
    const layout: Layout = {
      placements: [placement('a'), placement('c')],
      unplaced: [],
      metrics: { totalPlaced: 2, usedFloorPositions: 2, floorFillPercent: 5, volumeFillPercent: 2 },
      contractVersion: '0.9.0',
    };
    // stable palette: SO-1→slot 3, SO-2→slot 0 (unrelated to appearance)
    const colors = new Map([['SO-1', 3], ['SO-2', 0]]);
    const bd = orderBreakdown(load, layout, colors);
    // display order is still appearance (SO-1 first)…
    expect(bd.map((o) => o.orderId)).toEqual(['SO-1', 'SO-2']);
    // …but the palette slot comes from the map
    expect(bd.find((o) => o.orderId === 'SO-1')!.colorIndex).toBe(3);
    expect(bd.find((o) => o.orderId === 'SO-2')!.colorIndex).toBe(0);
  });

  it('falls back to the cargo id when name is empty', () => {
    const load2: Load = {
      vehicle: load.vehicle,
      cargo: [{ ...cargo('x', '', 'SO-9') }],
    };
    const layout: Layout = {
      placements: [placement('x')],
      unplaced: [],
      metrics: { totalPlaced: 1, usedFloorPositions: 1, floorFillPercent: 1, volumeFillPercent: 1 },
      contractVersion: '0.9.0',
    };
    expect(orderBreakdown(load2, layout)[0].items[0].name).toBe('x');
  });
});
