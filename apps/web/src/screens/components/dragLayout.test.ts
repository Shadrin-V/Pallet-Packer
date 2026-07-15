import { describe, it, expect } from 'vitest';
import { calculateLayout, findGeometryViolations, type Load } from '@shadrin-v/engine';
import { snap, moveStack, SNAP_MM } from './dragLayout';

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
