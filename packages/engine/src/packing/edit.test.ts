import { describe, it, expect } from 'vitest';
import type { CargoType, Layout, Load } from '../model/index';
import { calculateLayout } from '../api/api';
import { findGeometryViolations } from '../geometry/geometry';
import { moveStack, rotateStack, unplaceStack, placeStack, stackBuffer } from './edit';

const cargo = (over: Partial<CargoType> & Pick<CargoType, 'id' | 'name'>): CargoType => ({
  length: 1200,
  width: 800,
  height: 1000,
  quantity: 1,
  rotation: 'yawOnly',
  stacking: { stackable: false },
  nesting: { nestable: false },
  state: 'entschachtelt',
  ...over,
});

/** 2×2×2 m hold; one 1×1×1 m cube type — 4 floor positions, one tier each. */
const cubes: Load = {
  vehicle: { id: 'v', name: 'V', length: 2000, width: 2000, height: 1000 },
  cargo: [cargo({ id: 'c', name: 'Cube', length: 1000, width: 1000, height: 1000, quantity: 4 })],
};

/** Balance invariant: manual edits never invent or lose units (ADR 019). */
function totalUnits(load: Load, layout: Layout, cargoTypeId: string): number {
  const placed = layout.placements.filter((p) => p.cargoTypeId === cargoTypeId).length;
  const unplaced = layout.unplaced
    .filter((u) => u.cargoTypeId === cargoTypeId)
    .reduce((s, u) => s + u.count, 0);
  return placed + unplaced;
}

describe('unplaceStack', () => {
  it('takes the stack off the floor and returns its units to unplaced', () => {
    const layout = calculateLayout(cubes);
    const before = totalUnits(cubes, layout, 'c');
    const sel = { cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y };

    const { layout: next, error } = unplaceStack(cubes, layout, sel);

    expect(error).toBeUndefined();
    expect(next.placements.filter((p) => p.x === sel.x && p.y === sel.y)).toHaveLength(0);
    expect(next.unplaced.find((u) => u.cargoTypeId === 'c')?.count).toBe(1);
    expect(totalUnits(cubes, next, 'c')).toBe(before); // nothing invented or lost
    expect(findGeometryViolations(cubes, next)).toEqual([]);
  });

  it('recomputes metrics rather than leaving the packer’s numbers behind', () => {
    const layout = calculateLayout(cubes);
    const sel = { cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y };
    const { layout: next } = unplaceStack(cubes, layout, sel);

    expect(next.metrics.totalPlaced).toBe(layout.metrics.totalPlaced - 1);
    expect(next.metrics.usedFloorPositions).toBe(layout.metrics.usedFloorPositions - 1);
    expect(next.metrics.floorFillPercent).toBeLessThan(layout.metrics.floorFillPercent);
  });

  it('rejects a ref that matches no column', () => {
    const layout = calculateLayout(cubes);
    const { layout: next, error } = unplaceStack(cubes, layout, { cargoTypeId: 'c', x: 12345, y: 0 });
    expect(error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(next).toBe(layout);
  });

  it('takes the WHOLE column, every tier of it', () => {
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 2000, width: 2000, height: 3000 },
      cargo: [cargo({ id: 's', name: 'Stackable', length: 1000, width: 1000, height: 1000, quantity: 3, stacking: { stackable: true } })],
    };
    const layout = calculateLayout(load);
    const sel = { cargoTypeId: 's', x: layout.placements[0].x, y: layout.placements[0].y };
    const tiers = layout.placements.filter((p) => p.x === sel.x && p.y === sel.y).length;
    expect(tiers).toBe(3);

    const { layout: next } = unplaceStack(load, layout, sel);
    expect(next.placements).toHaveLength(0);
    expect(next.unplaced.find((u) => u.cargoTypeId === 's')?.count).toBe(3);
  });
});

describe('placeStack', () => {
  /** Free the first floor position, then hand it back. */
  const emptied = () => {
    const layout = calculateLayout(cubes);
    const sel = { cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y };
    return { sel, ...unplaceStack(cubes, layout, sel) };
  };

  it('puts an unplaced stack back and drops it out of unplaced', () => {
    const { sel, layout } = emptied();
    const { layout: next, error } = placeStack(cubes, layout, {
      cargoTypeId: 'c',
      x: sel.x,
      y: sel.y,
      orientation: 'lwh',
    });

    expect(error).toBeUndefined();
    expect(next.placements.filter((p) => p.x === sel.x && p.y === sel.y)).toHaveLength(1);
    expect(next.unplaced.find((u) => u.cargoTypeId === 'c')?.count ?? 0).toBe(0);
    expect(next.metrics.totalPlaced).toBe(4);
    expect(findGeometryViolations(cubes, next)).toEqual([]);
  });

  it('refuses to place onto another stack', () => {
    const { layout } = emptied();
    const occupied = layout.placements[0];
    const { layout: next, error } = placeStack(cubes, layout, {
      cargoTypeId: 'c',
      x: occupied.x,
      y: occupied.y,
      orientation: 'lwh',
    });
    expect(error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(next).toBe(layout);
  });

  it('refuses to place outside the hold', () => {
    const { layout } = emptied();
    const { layout: next, error } = placeStack(cubes, layout, {
      cargoTypeId: 'c',
      x: 1900,
      y: 1900,
      orientation: 'lwh',
    });
    expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
    expect(next).toBe(layout);
  });

  it('refuses when the type has nothing left to place', () => {
    const layout = calculateLayout(cubes); // everything fits → unplaced empty
    const { layout: next, error } = placeStack(cubes, layout, {
      cargoTypeId: 'c',
      x: 0,
      y: 0,
      orientation: 'lwh',
    });
    expect(error?.code).toBe('ERR_EDIT_NOTHING_TO_PLACE');
    expect(next).toBe(layout);
  });

  it('builds the column by the engine’s own stack rules, capped by what is unplaced', () => {
    // hold takes 3 tiers; 5 units requested on a 1-position floor → 3 placed, 2 unplaced
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 3000 },
      cargo: [cargo({ id: 's', name: 'S', length: 1000, width: 1000, height: 1000, quantity: 5, stacking: { stackable: true } })],
    };
    const layout = calculateLayout(load);
    expect(layout.placements).toHaveLength(3);
    expect(layout.unplaced.find((u) => u.cargoTypeId === 's')?.count).toBe(2);

    const { layout: cleared } = unplaceStack(load, layout, { cargoTypeId: 's', x: 0, y: 0 });
    expect(cleared.unplaced.find((u) => u.cargoTypeId === 's')?.count).toBe(5);

    // placing back builds a full 3-tier column (hold limit), leaving 2 unplaced
    const { layout: next, error } = placeStack(load, cleared, { cargoTypeId: 's', x: 0, y: 0, orientation: 'lwh' });
    expect(error).toBeUndefined();
    expect(next.placements).toHaveLength(3);
    expect(next.unplaced.find((u) => u.cargoTypeId === 's')?.count).toBe(2);
    expect(findGeometryViolations(load, next)).toEqual([]);
  });

  it('honours an explicit units count below the full stack', () => {
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 3000 },
      cargo: [cargo({ id: 's', name: 'S', length: 1000, width: 1000, height: 1000, quantity: 3, stacking: { stackable: true } })],
    };
    const layout = calculateLayout(load);
    const { layout: cleared } = unplaceStack(load, layout, { cargoTypeId: 's', x: 0, y: 0 });
    const { layout: next } = placeStack(load, cleared, { cargoTypeId: 's', x: 0, y: 0, orientation: 'lwh', units: 2 });

    expect(next.placements).toHaveLength(2);
    expect(next.unplaced.find((u) => u.cargoTypeId === 's')?.count).toBe(1);
  });

  it('refuses an orientation that breaks forklift access (ADR 018)', () => {
    // two-sided pallet, rear loading → fork axis must run along x; 'wlh' turns it away from the door
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 4000, height: 1000 },
      cargo: [
        cargo({ id: 't', name: 'TwoSided', length: 1200, width: 1000, height: 1000, quantity: 1, forkAccess: 'twoSides', forkAxis: 'length' }),
      ],
      loadingMode: 'rear',
    };
    const layout = calculateLayout(load);
    const { layout: cleared } = unplaceStack(load, layout, {
      cargoTypeId: 't',
      x: layout.placements[0].x,
      y: layout.placements[0].y,
    });
    const { layout: next, error } = placeStack(load, cleared, { cargoTypeId: 't', x: 0, y: 0, orientation: 'wlh' });

    expect(error?.code).toBe('ERR_EDIT_FORK_ACCESS');
    expect(next).toBe(cleared);
  });

  it('refuses a type that does not stand in this hold at all, naming the real reason', () => {
    // hold 900 high, pallet 1000 → computed stack is 0 units: there is nothing to build here
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 4000, height: 900 },
      cargo: [cargo({ id: 'tall', name: 'Tall', length: 1000, width: 1000, height: 1000, quantity: 2 })],
    };
    const layout: Layout = {
      placements: [],
      unplaced: [{ cargoTypeId: 'tall', count: 2 }],
      metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
      contractVersion: '0.12.0',
    };
    const { layout: next, error } = placeStack(load, layout, { cargoTypeId: 'tall', x: 0, y: 0, orientation: 'lwh' });
    expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
    expect(next).toBe(layout);
  });

  it('refuses a units request below one instead of quietly placing one', () => {
    const { sel, layout } = emptied();
    const { layout: next, error } = placeStack(cubes, layout, {
      cargoTypeId: 'c',
      x: sel.x,
      y: sel.y,
      orientation: 'lwh',
      units: 0,
    });
    expect(error?.code).toBe('ERR_EDIT_NOTHING_TO_PLACE');
    expect(next).toBe(layout);
  });

  it('is deterministic: the same placement twice yields the same layout', () => {
    const { sel, layout } = emptied();
    const spec = { cargoTypeId: 'c', x: sel.x, y: sel.y, orientation: 'lwh' as const };
    expect(placeStack(cubes, layout, spec).layout).toEqual(placeStack(cubes, layout, spec).layout);
  });
});

describe('moveStack (moved into the engine, ADR 019)', () => {
  it('moves a stack to a free spot and keeps the layout valid', () => {
    const layout = calculateLayout(cubes);
    const sel = { cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y };
    const { layout: cleared } = unplaceStack(cubes, layout, { cargoTypeId: 'c', x: 1000, y: 1000 });

    const { layout: next, error } = moveStack(cubes, cleared, sel, 1000, 1000);
    expect(error).toBeUndefined();
    expect(next.placements.some((p) => p.x === 1000 && p.y === 1000)).toBe(true);
    expect(findGeometryViolations(cubes, next)).toEqual([]);
  });

  it('reports the reason when the target is taken', () => {
    const layout = calculateLayout(cubes);
    const a = layout.placements[0];
    const b = layout.placements[1];
    const { layout: next, error } = moveStack(cubes, layout, { cargoTypeId: 'c', x: a.x, y: a.y }, b.x, b.y);
    expect(error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(next).toBe(layout);
  });

  it('reports the reason when the target hangs out of the hold', () => {
    const layout = calculateLayout(cubes);
    const a = layout.placements[0];
    const { error } = moveStack(cubes, layout, { cargoTypeId: 'c', x: a.x, y: a.y }, 1900, 0);
    expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
  });
});

describe('rotateStack (moved into the engine, ADR 019)', () => {
  const pallets: Load = {
    vehicle: { id: 'v', name: 'V', length: 3000, width: 2000, height: 1000 },
    cargo: [cargo({ id: 'p', name: 'P', length: 1200, width: 800, height: 900, quantity: 1 })],
  };

  it('flips lwh ↔ wlh when there is room', () => {
    const layout = calculateLayout(pallets);
    const from = layout.placements[0].orientation;
    const { layout: next, error } = rotateStack(pallets, layout, { cargoTypeId: 'p', x: 0, y: 0 });

    expect(error).toBeUndefined();
    expect(next.placements[0].orientation).not.toBe(from);
    expect(findGeometryViolations(pallets, next)).toEqual([]);
  });

  it('says why a non-rotatable type cannot turn — instead of silently doing nothing', () => {
    const fixed: Load = {
      vehicle: pallets.vehicle,
      cargo: [cargo({ id: 'f', name: 'F', length: 1200, width: 800, height: 900, quantity: 1, rotation: 'none' })],
    };
    const layout = calculateLayout(fixed);
    const { layout: next, error } = rotateStack(fixed, layout, { cargoTypeId: 'f', x: 0, y: 0 });
    expect(error?.code).toBe('ERR_EDIT_ROTATION');
    expect(next).toBe(layout);
  });

  it('says why a rotation that would collide is refused', () => {
    // 1200×800 pallets side by side: turning the first one broadside hits the second
    const tight: Load = {
      vehicle: { id: 'v', name: 'V', length: 2400, width: 800, height: 1000 },
      cargo: [cargo({ id: 'p', name: 'P', length: 1200, width: 800, height: 900, quantity: 2 })],
    };
    const layout = calculateLayout(tight);
    expect(layout.placements).toHaveLength(2);
    const { error } = rotateStack(tight, layout, { cargoTypeId: 'p', x: 0, y: 0 });
    expect(error?.code).toBeDefined(); // out of bounds or overlap — either way, with a reason
  });
});

describe('stackBuffer', () => {
  it('is empty when everything is placed', () => {
    expect(stackBuffer(cubes, calculateLayout(cubes))).toEqual([]);
  });

  it('groups unplaced units into full stacks plus a remainder', () => {
    // 1 floor position, 3 tiers per stack, 8 units → 3 placed, 5 unplaced → stacks of 3 + 2
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 3000 },
      cargo: [cargo({ id: 's', name: 'S', length: 1000, width: 1000, height: 1000, quantity: 8, stacking: { stackable: true } })],
    };
    const layout = calculateLayout(load);
    expect(stackBuffer(load, layout)).toEqual([
      { cargoTypeId: 's', units: 3 },
      { cargoTypeId: 's', units: 2 },
    ]);
  });

  it('keeps the cargo list order (request priority), deterministically', () => {
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 1000 },
      cargo: [
        cargo({ id: 'a', name: 'A', length: 1000, width: 1000, height: 1000, quantity: 2 }),
        cargo({ id: 'b', name: 'B', length: 1000, width: 1000, height: 1000, quantity: 2 }),
      ],
    };
    const layout = calculateLayout(load);
    const buffer = stackBuffer(load, layout);
    expect(buffer.map((b) => b.cargoTypeId)).toEqual(['a', 'b', 'b']); // a: 1 placed + 1 left; b: 2 left
    expect(stackBuffer(load, layout)).toEqual(buffer);
  });

  it('offers nothing for a type that cannot stand in this hold', () => {
    const load: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 4000, height: 900 },
      cargo: [cargo({ id: 'tall', name: 'Tall', length: 1000, width: 1000, height: 1000, quantity: 2 })],
    };
    const layout: Layout = {
      placements: [],
      unplaced: [{ cargoTypeId: 'tall', count: 2 }],
      metrics: { totalPlaced: 0, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
      contractVersion: '0.12.0',
    };
    expect(stackBuffer(load, layout)).toEqual([]);
  });

  it('reflects a stack taken off the floor', () => {
    const layout = calculateLayout(cubes);
    const { layout: next } = unplaceStack(cubes, layout, {
      cargoTypeId: 'c',
      x: layout.placements[0].x,
      y: layout.placements[0].y,
    });
    expect(stackBuffer(cubes, next)).toEqual([{ cargoTypeId: 'c', units: 1 }]);
  });
});
