import { describe, it, expect } from 'vitest';
import type { CargoType, Load, Vehicle } from '../model/index';
import { packLoad } from '../packing/orchestrator';
import { computeFillMetrics } from './metrics';

/** Minimal entschachtelt cube cargo helper. */
function cube(id: string, size: number, quantity: number, extra: Partial<CargoType> = {}): CargoType {
  return {
    id,
    name: id,
    length: size,
    width: size,
    height: size,
    quantity,
    rotation: 'none',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...extra,
  };
}

function load(vehicle: Vehicle, cargo: CargoType[]): Load {
  return { vehicle, cargo };
}

const V = (length: number, width: number, height: number): Vehicle => ({
  id: 'v',
  name: 'v',
  length,
  width,
  height,
});

describe('computeFillMetrics', () => {
  it('trivial full hold: 2×2×2 hold, 1×1×1 cargo ×8 → 100% floor and volume', () => {
    const l = load(V(2000, 2000, 2000), [cube('c', 1000, 8)]);
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(8);

    const m = computeFillMetrics(l, layout);
    expect(m.floorFillPercent).toBe(100);
    expect(m.volumeFillPercent).toBe(100);
  });

  it('half-covered floor, single tier → 50% floor and 50% volume', () => {
    // hold 2×2×1 (one tier high); two 1×1×1 cubes → cover 2 of 4 floor cells, 1 tier tall.
    const l = load(V(2000, 2000, 1000), [cube('c', 1000, 2)]);
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(2);

    const m = computeFillMetrics(l, layout);
    expect(m.floorFillPercent).toBe(50);
    expect(m.volumeFillPercent).toBe(50);
  });

  it('nothing placed → 0% floor and volume', () => {
    const l = load(V(1000, 1000, 1000), [cube('big', 2000, 3)]);
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(0);

    const m = computeFillMetrics(l, layout);
    expect(m.floorFillPercent).toBe(0);
    expect(m.volumeFillPercent).toBe(0);
  });

  it('degenerate hold (zero dimension) → 0% (no divide-by-zero)', () => {
    const l = load(V(0, 1000, 1000), [cube('c', 500, 1)]);
    const m = computeFillMetrics(l, { ...packLoad(l), placements: [] });
    expect(m.floorFillPercent).toBe(0);
    expect(m.volumeFillPercent).toBe(0);
  });

  it('nested column: 3 units in a 2-unit-tall hold → 100% volume (bounding box, not Σ per-unit)', () => {
    // H=1000, stepHeight=500, hold height 2000 → sequential n = 1 + floor((2000-1000)/500) = 3.
    // Column bounding height = 1000 + 2·500 = 2000 = full hold. Per-unit-sum would be 3·1e9 = 150%.
    const cargo: CargoType = {
      id: 'nest',
      name: 'nest',
      length: 1000,
      width: 1000,
      height: 1000,
      quantity: 3,
      rotation: 'none',
      stacking: { stackable: false },
      nesting: { nestable: true, stepHeight: 500 },
      state: 'verschachtelt',
    };
    const l = load(V(1000, 1000, 2000), [cargo]);
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(3);

    const m = computeFillMetrics(l, layout);
    expect(m.floorFillPercent).toBe(100);
    expect(m.volumeFillPercent).toBe(100);
    expect(m.volumeFillPercent).toBeLessThanOrEqual(100);
  });

  it('nested column shorter than hold → fractional volume (H+(n-1)·Δh, not n·H)', () => {
    // maxNested = 2 → n=2, bounding height = 1000 + 1·500 = 1500 of 2000 → 75%.
    const cargo: CargoType = {
      id: 'nest2',
      name: 'nest2',
      length: 1000,
      width: 1000,
      height: 1000,
      quantity: 2,
      rotation: 'none',
      stacking: { stackable: false },
      nesting: { nestable: true, stepHeight: 500, maxNested: 2 },
      state: 'verschachtelt',
    };
    const l = load(V(1000, 1000, 2000), [cargo]);
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(2);

    const m = computeFillMetrics(l, layout);
    expect(m.floorFillPercent).toBe(100);
    expect(m.volumeFillPercent).toBe(75);
  });

  it('is deterministic (two runs equal)', () => {
    const l = load(V(2400, 2000, 2000), [cube('a', 800, 5), cube('b', 600, 7)]);
    const layout = packLoad(l);
    expect(computeFillMetrics(l, layout)).toEqual(computeFillMetrics(l, layout));
  });

  it('packLoad wires real metrics into the returned Layout (no 0 stubs)', () => {
    const l = load(V(2000, 2000, 2000), [cube('c', 1000, 8)]);
    const layout = packLoad(l);
    expect(layout.metrics.floorFillPercent).toBe(100);
    expect(layout.metrics.volumeFillPercent).toBe(100);
  });
});
