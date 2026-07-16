import { describe, it, expect } from 'vitest';
import { calculateLayout, findGeometryViolations, type Layout, type Load } from '@shadrin-v/engine';
import { snap, moveStack, rotateStack, SNAP_MM } from './editLayout';
import type { RotationRule } from '@shadrin-v/engine';

const cargo = (id: string, qty: number) => ({
  id,
  name: id,
  length: 1000,
  width: 1000,
  height: 1000,
  quantity: qty,
  rotation: 'none' as const,
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt' as const,
  orderId: 'SO-1',
});

/** Oblong cargo: rotating its footprint actually changes the occupied area (1200×800). */
const oblong = (id: string, qty: number, rotation: RotationRule = 'yawOnly') => ({
  ...cargo(id, qty),
  id,
  name: id,
  length: 1200,
  width: 800,
  height: 1000,
  rotation,
  quantity: qty,
});

describe('snap', () => {
  it('rounds to the grid', () => {
    expect(snap(1240)).toBe(1200);
    expect(snap(1260)).toBe(1300);
    expect(SNAP_MM).toBe(100);
  });
});

describe('moveStack', () => {
  it('accepts a move to free space (snapped, no violations)', () => {
    // 3000×1000×2000 hold, 1000³ cargo ×2 → one stack of 2 at x=0; x∈[1000,3000] is free.
    const load: Load = { vehicle: { id: 'v', name: 'LKW', length: 3000, width: 1000, height: 2000 }, cargo: [cargo('c1', 2)] };
    const layout = calculateLayout(load);
    const p0 = layout.placements[0];
    const moved = moveStack(load, layout, { cargoTypeId: p0.cargoTypeId, x: p0.x, y: p0.y }, 2040, p0.y);

    expect(moved).not.toBe(layout); // accepted (new object)
    expect(findGeometryViolations(load, moved)).toEqual([]);
    expect(moved.placements.every((p) => p.x === 2000)).toBe(true); // snapped 2040→2000
    expect(moved.placements).toHaveLength(2); // both tiers moved
  });

  it('rejects a move that overlaps another stack (returns original)', () => {
    // 2000×1000×2000 hold, 1000³ cargo ×4 → two stacks at x=0 and x=1000.
    const load: Load = { vehicle: { id: 'v', name: 'LKW', length: 2000, width: 1000, height: 2000 }, cargo: [cargo('c1', 4)] };
    const layout = calculateLayout(load);
    const xs = [...new Set(layout.placements.map((p) => p.x))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 1000]);
    // move the x=0 stack onto the x=1000 stack → overlap → reject
    const moved = moveStack(load, layout, { cargoTypeId: 'c1', x: 0, y: 0 }, 1000, 0);
    expect(moved).toBe(layout); // rejected (same reference)
  });
});

describe('rotateStack (T5)', () => {
  /** Layout with the given placements, borrowing metrics/contractVersion from a real calculation. */
  const withPlacements = (load: Load, placements: Layout['placements']): Layout => ({
    ...calculateLayout(load),
    placements,
  });
  const tier = (id: string, x: number, y: number, z: number, t: number, o: 'lwh' | 'wlh') => ({
    cargoTypeId: id,
    x,
    y,
    z,
    orientation: o,
    tier: t,
    state: 'entschachtelt' as const,
  });

  it('yaw-rotates every tier of the stack into free space', () => {
    // 3000×2000×2000 hold, 1200×800×1000 cargo ×2 → one stack of two tiers; both footprints fit.
    const load: Load = { vehicle: { id: 'v', name: 'LKW', length: 3000, width: 2000, height: 2000 }, cargo: [oblong('c1', 2)] };
    const layout = withPlacements(load, [tier('c1', 0, 0, 0, 1, 'lwh'), tier('c1', 0, 0, 1000, 2, 'lwh')]);
    const rotated = rotateStack(load, layout, { cargoTypeId: 'c1', x: 0, y: 0 });

    expect(rotated).not.toBe(layout); // accepted
    expect(rotated.placements.map((p) => p.orientation)).toEqual(['wlh', 'wlh']);
    expect(rotated.placements).toHaveLength(2); // rotation never drops a tier
    expect(findGeometryViolations(load, rotated)).toEqual([]);
  });

  it('rejects a rotation that breaks two-sided forklift access under a single-door mode (ADR 018)', () => {
    // 1200×800 two-sided pallet, forks along length, rear loading → pinned lwh. Rotating to wlh would
    // turn its accessible pair away from the rear door → findGeometryViolations flags fork-access.
    const load: Load = {
      vehicle: { id: 'v', name: 'LKW', length: 3000, width: 2000, height: 2000 },
      cargo: [{ ...oblong('c1', 1), forkAccess: 'twoSides' as const, forkAxis: 'length' as const }],
      loadingMode: 'rear',
    };
    const layout = withPlacements(load, [tier('c1', 0, 0, 0, 1, 'lwh')]);
    expect(rotateStack(load, layout, { cargoTypeId: 'c1', x: 0, y: 0 })).toBe(layout); // rejected
  });

  it('rejects a rotation whose footprint would overlap the neighbouring stack', () => {
    // Two stacks side by side across the width: rotating the first (1200×800 → 800×1200) grows it
    // into y ∈ [0,1200), which overlaps the neighbour at y = 800.
    const load: Load = { vehicle: { id: 'v', name: 'LKW', length: 3000, width: 2000, height: 2000 }, cargo: [oblong('c1', 2)] };
    const layout = withPlacements(load, [tier('c1', 0, 0, 0, 1, 'lwh'), tier('c1', 0, 800, 0, 1, 'lwh')]);
    expect(rotateStack(load, layout, { cargoTypeId: 'c1', x: 0, y: 0 })).toBe(layout); // same reference
  });

  it('rejects a rotation that would push the stack out of the hold', () => {
    // Hold is only 1000 wide: rotated footprint (dy = 1200) does not fit across the width.
    const load: Load = { vehicle: { id: 'v', name: 'LKW', length: 3000, width: 1000, height: 2000 }, cargo: [oblong('c1', 1)] };
    const layout = withPlacements(load, [tier('c1', 0, 0, 0, 1, 'lwh')]);
    expect(rotateStack(load, layout, { cargoTypeId: 'c1', x: 0, y: 0 })).toBe(layout);
  });

  it('rejects rotation for a position whose rule forbids it (rotation: none)', () => {
    const load: Load = { vehicle: { id: 'v', name: 'LKW', length: 3000, width: 2000, height: 2000 }, cargo: [oblong('c1', 1, 'none')] };
    const layout = withPlacements(load, [tier('c1', 0, 0, 0, 1, 'lwh')]);
    expect(rotateStack(load, layout, { cargoTypeId: 'c1', x: 0, y: 0 })).toBe(layout);
  });
});
