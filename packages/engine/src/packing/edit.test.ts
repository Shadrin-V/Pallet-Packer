import { describe, it, expect } from 'vitest';
import type { CargoType, Layout, Load } from '../model/index';
import { calculateLayout } from '../api/api';
import { findGeometryViolations } from '../geometry/geometry';
import { moveStack, rotateStack, unplaceStack, placeStack, stackBuffer, unplaceStacks, moveStacks } from './edit';
import type { StackRef } from './edit';

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

describe('unplaceStacks', () => {
  it('takes every named column off the floor in one call', () => {
    const layout = calculateLayout(cubes);
    const before = totalUnits(cubes, layout, 'c');
    const refs = layout.placements.slice(0, 2).map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

    const { layout: next, error } = unplaceStacks(cubes, layout, refs);

    expect(error).toBeUndefined();
    expect(next.placements).toHaveLength(layout.placements.length - 2);
    expect(next.unplaced.find((u) => u.cargoTypeId === 'c')?.count).toBe(2);
    expect(totalUnits(cubes, next, 'c')).toBe(before); // nothing invented or lost
    expect(findGeometryViolations(cubes, next)).toEqual([]);
  });

  it('treats a repeated ref as one stack — a selection is a set', () => {
    const layout = calculateLayout(cubes);
    const p = layout.placements[0];
    const ref = { cargoTypeId: 'c', x: p.x, y: p.y };

    const { layout: next, error } = unplaceStacks(cubes, layout, [ref, ref]);

    expect(error).toBeUndefined();
    expect(next.placements).toHaveLength(layout.placements.length - 1);
    expect(next.unplaced.find((u) => u.cargoTypeId === 'c')?.count).toBe(1);
  });

  it('is a no-op for an empty selection', () => {
    const layout = calculateLayout(cubes);
    const { layout: next, error } = unplaceStacks(cubes, layout, []);
    expect(error).toBeUndefined();
    expect(next).toBe(layout);
  });

  it('refuses the WHOLE call when one ref names no column', () => {
    const layout = calculateLayout(cubes);
    const good = { cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y };

    const { layout: next, error } = unplaceStacks(cubes, layout, [good, { cargoTypeId: 'c', x: 12345, y: 0 }]);

    expect(error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(next).toBe(layout); // the good ref was NOT applied
  });
});

describe('moveStacks', () => {
  /** 4×2 m hold, 1×1 m cubes: 8 floor positions, so a group has room to shift by one cell. */
  const wide: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 1000 },
    cargo: [cargo({ id: 'c', name: 'Cube', length: 1000, width: 1000, height: 1000, quantity: 4 })],
  };

  /** Every pairwise offset within a set of points — the shape of the group, position-independent. */
  const shape = (pts: { x: number; y: number }[]): string =>
    pts
      .map((a) => pts.map((b) => `${a.x - b.x},${a.y - b.y}`).join('|'))
      .sort()
      .join(';');

  it('preserves the mutual arrangement of the group', () => {
    const layout = calculateLayout(wide);
    // The dense-floor packer fills a full shelf across the WIDTH before starting a new one along the
    // length (ADR 017), so `wide`'s 4 cubes land as a 2×2 block flush against both side walls — width
    // has no slack at all. The only free floor is further along the LENGTH, past the far shelf: pick
    // the shelf at the largest x and slide it one cell deeper.
    const refs = [...layout.placements]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .slice(-2)
      .map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    const before = shape(refs);

    const { layout: next, error } = moveStacks(wide, layout, refs, 1000, 0);

    expect(error).toBeUndefined();
    // Read the moved columns back OUT of the resulting layout — asserting on the refs we passed in
    // would only re-check our own arithmetic, not what moveStacks actually did.
    const moved = refs.map((r) => {
      const p = next.placements.find((q) => q.x === r.x + 1000 && q.y === r.y);
      expect(p).toBeDefined();
      return { x: p!.x, y: p!.y };
    });
    expect(shape(moved)).toBe(before);
    expect(findGeometryViolations(wide, next)).toEqual([]);
  });

  it('shifts every placement of every selected column, including upper tiers', () => {
    const tall: Load = {
      vehicle: { id: 'v', name: 'V', length: 4000, width: 2000, height: 3000 },
      cargo: [cargo({ id: 's', name: 'Stackable', length: 1000, width: 1000, height: 1000, quantity: 6, stacking: { stackable: true } })],
    };
    const layout = calculateLayout(tall);
    const first = layout.placements[0];
    const ref = { cargoTypeId: 's', x: first.x, y: first.y };
    const tiers = layout.placements.filter((p) => p.x === ref.x && p.y === ref.y).length;
    expect(tiers).toBeGreaterThan(1);

    // Same shelf-filling behaviour as above: the two columns of `tall` sit side by side across the
    // full width (y = 0 and y = 1000), so a shift along y would land the first column on the second,
    // unselected one. Shift along the length instead, into genuinely free floor.
    const { layout: next, error } = moveStacks(tall, layout, [ref], 1000, 0);

    expect(error).toBeUndefined();
    expect(next.placements.filter((p) => p.x === ref.x + 1000 && p.y === ref.y)).toHaveLength(tiers);
    expect(next.placements.filter((p) => p.x === ref.x && p.y === ref.y)).toHaveLength(0);
  });

  it('refuses the whole move when ONE member would leave the hold, leaving the layout untouched', () => {
    const layout = calculateLayout(wide);
    const refs = layout.placements.map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

    const { layout: next, error } = moveStacks(wide, layout, refs, 100000, 0);

    expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
    expect(next).toBe(layout); // identity: not a rebuilt copy, the ORIGINAL object
  });

  /**
   * A hold with a free cell to the right of the last stack: 3 cubes in a 4 m row. Width is exactly
   * ONE cell (1 m) — with any more width the shelf packer (ADR 017) would fill across width before
   * length, giving an L-shape instead of a single-file row.
   */
  const row: Load = {
    vehicle: { id: 'v', name: 'V', length: 4000, width: 1000, height: 1000 },
    cargo: [cargo({ id: 'c', name: 'Cube', length: 1000, width: 1000, height: 1000, quantity: 3 })],
  };
  /** The stacks of `row`, left to right. */
  const rowRefs = (layout: Layout): StackRef[] =>
    [...new Map(layout.placements.map((p) => [`${p.x},${p.y}`, p])).values()]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));

  it('refuses the whole move when a member would land on an unselected stack', () => {
    const layout = calculateLayout(row);
    const refs = rowRefs(layout);
    // Neighbours one cell apart, and only the LEFT one moves — so it lands on a stack that stays.
    const step = refs[1].x - refs[0].x;
    expect(step).toBeGreaterThan(0);
    expect(refs[1].y).toBe(refs[0].y);

    const { layout: next, error } = moveStacks(row, layout, [refs[0]], step, 0);

    expect(error?.code).toBe('ERR_EDIT_OVERLAP');
    expect(next).toBe(layout);
  });

  it('lets the group slide THROUGH its own members — they move together', () => {
    const layout = calculateLayout(row);
    const refs = rowRefs(layout);
    const step = refs[1].x - refs[0].x;
    // The SAME shift that was just refused for one stack is legal for the whole row: each member
    // lands where the next one stood, and that one is moving too.
    const { layout: next, error } = moveStacks(row, layout, refs, step, 0);

    expect(error).toBeUndefined();
    expect(findGeometryViolations(row, next)).toEqual([]);
    expect(next.placements.some((p) => p.x === refs[refs.length - 1].x + step)).toBe(true);
  });

  it('is a no-op for an empty selection and for a zero delta', () => {
    const layout = calculateLayout(wide);
    const refs = [{ cargoTypeId: 'c', x: layout.placements[0].x, y: layout.placements[0].y }];
    expect(moveStacks(wide, layout, [], 500, 500).layout).toBe(layout);
    expect(moveStacks(wide, layout, refs, 0, 0).layout).toBe(layout);
    expect(moveStacks(wide, layout, [], 500, 500).error).toBeUndefined();
    expect(moveStacks(wide, layout, refs, 0, 0).error).toBeUndefined();
  });

  it('refuses when a ref names no column', () => {
    const layout = calculateLayout(wide);
    const { layout: next, error } = moveStacks(wide, layout, [{ cargoTypeId: 'c', x: 12345, y: 0 }], 0, 1000);
    expect(error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(next).toBe(layout);
  });

  it('conserves units — a move never invents or drops cargo', () => {
    const layout = calculateLayout(wide);
    const before = totalUnits(wide, layout, 'c');
    // A zero delta would hit the no-op short-circuit and return the identical object, making the
    // assertion below pass no matter what moveStacks does — so this uses the same non-zero,
    // genuinely-free shift as the "preserves the mutual arrangement" test above, to actually exercise
    // the placement-rebuilding path.
    const refs = [...layout.placements]
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .slice(-2)
      .map((p) => ({ cargoTypeId: 'c', x: p.x, y: p.y }));
    const { layout: next, error } = moveStacks(wide, layout, refs, 1000, 0);
    expect(error).toBeUndefined();
    expect(totalUnits(wide, next, 'c')).toBe(before);
  });

  it('refuses a bogus ref even at zero delta, instead of short-circuiting past validation', () => {
    // moveStack (singular) validates the ref before its zero-delta short-circuit; moveStacks must
    // match that order — a (0, 0) move is only a no-op for a REF THAT EXISTS.
    const layout = calculateLayout(wide);
    const { layout: next, error } = moveStacks(wide, layout, [{ cargoTypeId: 'c', x: 12345, y: 0 }], 0, 0);
    expect(error?.code).toBe('ERR_EDIT_NO_STACK');
    expect(next).toBe(layout);
  });

  describe('mixed selections — the group refuses as a WHOLE, not per-ref', () => {
    // ADR 021's central invariant: a selection with one good member and one bad one must refuse
    // entirely, and the good member must not have moved even transiently. A per-ref loop that applies
    // good members before hitting a bad one would pass every other test in this file but fail these.

    it('refuses when one member stays in bounds and another would leave the hold', () => {
      const layout = calculateLayout(wide);
      const sorted = [...layout.placements].sort((a, b) => a.x - b.x || a.y - b.y);
      const good = sorted[0]; // smallest x — the 2×2 block's near wall
      const bad = sorted[sorted.length - 1]; // largest x — the far wall
      const refs = [
        { cargoTypeId: 'c', x: good.x, y: good.y },
        { cargoTypeId: 'c', x: bad.x, y: bad.y },
      ];
      // Land BAD exactly on the far wall (dx + its footprint overshoots by construction), while GOOD —
      // starting closer to the near wall — still has room: a delta derived from the packer's own
      // output, not a hardcoded distance.
      const dx = wide.vehicle.length - bad.x;
      // sanity: GOOD's target footprint (cube is 1000 mm on a side) stays inside the hold
      expect(good.x + dx + wide.cargo[0].length).toBeLessThanOrEqual(wide.vehicle.length);
      // Snapshot GOOD's own placement BEFORE the call, correlated by array index rather than by its
      // (x, y) — comparing against a live re-query of the same coordinates would trivially match
      // whatever the object now holds. `toBe(layout)` alone cannot tell an in-place mutation of this
      // object from an untouched one; this can.
      const goodIndex = layout.placements.findIndex((p) => p.x === good.x && p.y === good.y);
      const goodBefore = { x: layout.placements[goodIndex].x, y: layout.placements[goodIndex].y };

      const { layout: next, error } = moveStacks(wide, layout, refs, dx, 0);

      expect(error?.code).toBe('ERR_EDIT_OUT_OF_BOUNDS');
      expect(next).toBe(layout); // identity: nothing applied
      expect({ x: next.placements[goodIndex].x, y: next.placements[goodIndex].y }).toEqual(goodBefore); // good member untouched
    });

    it('refuses when one member lands free and another lands on an unselected stack', () => {
      const layout = calculateLayout(row);
      const refs = rowRefs(layout);
      const step = refs[1].x - refs[0].x;
      // Selection order is deliberate: refs[2] is processed FIRST and its target — one cell past the
      // row's right end — is genuinely free, so a naive per-ref loop would apply it. refs[0] is
      // processed SECOND and its target (refs[1]'s spot) is blocked, because refs[1] is NOT selected
      // and never moves out of the way. A loop-based implementation would therefore apply refs[2]
      // before discovering refs[0] is blocked, and return that half-applied layout — failing the
      // identity check below. (Putting the blocked member first, as an earlier version of this test
      // did, lets a naive loop refuse before applying anything, which passes by accident.)
      const selection = [refs[2], refs[0]];
      // Snapshot refs[2]'s own placement BEFORE the call, correlated by array index — see the
      // sibling test above for why this catches more than a live re-query of the same coordinates.
      const freeIndex = layout.placements.findIndex((p) => p.x === refs[2].x && p.y === refs[2].y);
      const freeBefore = { x: layout.placements[freeIndex].x, y: layout.placements[freeIndex].y };

      const { layout: next, error } = moveStacks(row, layout, selection, step, 0);

      expect(error?.code).toBe('ERR_EDIT_OVERLAP');
      expect(next).toBe(layout);
      // refs[2], the member whose own target was free, did NOT move either — the refusal is whole.
      expect({ x: next.placements[freeIndex].x, y: next.placements[freeIndex].y }).toEqual(freeBefore);
    });

    it('refuses when the selection combines a valid ref with one that names no column', () => {
      const layout = calculateLayout(wide);
      const good = layout.placements[0];
      const refs = [
        { cargoTypeId: 'c', x: good.x, y: good.y },
        { cargoTypeId: 'c', x: 12345, y: 0 },
      ];
      // Snapshot GOOD's own placement BEFORE the call, correlated by array index — see the first
      // mixed-selection test above for why this catches more than a live re-query of the coordinates.
      const goodIndex = 0; // `good` IS layout.placements[0]
      const goodBefore = { x: good.x, y: good.y };

      const { layout: next, error } = moveStacks(wide, layout, refs, 1000, 0);

      expect(error?.code).toBe('ERR_EDIT_NO_STACK');
      expect(next).toBe(layout);
      expect({ x: next.placements[goodIndex].x, y: next.placements[goodIndex].y }).toEqual(goodBefore); // good member untouched
    });
  });
});
