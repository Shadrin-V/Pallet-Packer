import { describe, it, expect } from 'vitest';
import type { CargoType, Load, Vehicle } from '../model/index';
import { ENGINE_CONTRACT_VERSION } from '../index';
import { findGeometryViolations } from '../geometry/geometry';
import { packLoad } from '../packing/orchestrator';
import { calculateLayout, getLayoutReport } from './api';

const V = (length: number, width: number, height: number): Vehicle => ({
  id: 'v',
  name: 'v',
  length,
  width,
  height,
});

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

describe('calculateLayout', () => {
  it('valid load → packs, populates metrics, no errors, contractVersion set', () => {
    const load: Load = { vehicle: V(2000, 2000, 2000), cargo: [cube('c', 1000, 8)] };
    const layout = calculateLayout(load);

    expect(layout.errors).toBeUndefined();
    expect(layout.contractVersion).toBe(ENGINE_CONTRACT_VERSION);
    expect(layout.metrics.totalPlaced).toBe(8);
    expect(layout.metrics.volumeFillPercent).toBe(100);
    // identical to the orchestrator directly (thin wrapper on the happy path)
    expect(layout).toEqual(packLoad(load));
  });

  it('result passes the geometry validator (no OOB / overlap / orientation)', () => {
    const load: Load = {
      vehicle: V(2400, 2000, 2000),
      cargo: [cube('a', 800, 5), cube('b', 600, 7, { orderId: 'B' })],
    };
    const layout = calculateLayout(load);
    expect(findGeometryViolations(load, layout)).toEqual([]);
  });

  it('empty cargo → ERR_EMPTY_LOAD, empty layout with error codes', () => {
    const load: Load = { vehicle: V(2000, 2000, 2000), cargo: [] };
    const layout = calculateLayout(load);

    expect(layout.placements).toEqual([]);
    expect(layout.unplaced).toEqual([]);
    expect(layout.metrics).toEqual({
      totalPlaced: 0,
      usedFloorPositions: 0,
      floorFillPercent: 0,
      volumeFillPercent: 0,
    });
    expect(layout.contractVersion).toBe(ENGINE_CONTRACT_VERSION);
    expect(layout.errors?.map((e) => e.code)).toContain('ERR_EMPTY_LOAD');
  });

  it('invalid dimension → error codes, no placements (does not throw)', () => {
    const load: Load = { vehicle: V(2000, 2000, 2000), cargo: [cube('bad', 0, 1)] };
    const layout = calculateLayout(load);
    expect(layout.placements).toEqual([]);
    expect(layout.errors && layout.errors.length).toBeGreaterThan(0);
    expect(layout.errors?.map((e) => e.code)).toContain('ERR_INVALID_DIMENSION');
  });

  it('is deterministic', () => {
    const load: Load = { vehicle: V(2400, 2000, 2000), cargo: [cube('a', 800, 5)] };
    expect(calculateLayout(load)).toEqual(calculateLayout(load));
  });
});

describe('getLayoutReport', () => {
  it('per-type requested = placed + unplaced, from the layout alone', () => {
    // hold fits 4 of 1000-cubes on the floor, 1 tier; ask for 6 → 4 placed, 2 unplaced.
    const load: Load = { vehicle: V(2000, 2000, 1000), cargo: [cube('c', 1000, 6)] };
    const layout = calculateLayout(load);
    const report = getLayoutReport(layout);

    expect(report.layout).toBe(layout);
    expect(report.perType).toEqual([
      { cargoTypeId: 'c', requested: 6, placed: 4, unplaced: 2 },
    ]);
  });

  it('multiple types, deterministic order (first appearance)', () => {
    const load: Load = {
      vehicle: V(2400, 2000, 2000),
      cargo: [cube('a', 800, 3), cube('b', 600, 5)],
    };
    const layout = calculateLayout(load);
    const report = getLayoutReport(layout);

    const ids = report.perType.map((p) => p.cargoTypeId);
    expect(new Set(ids)).toEqual(new Set(['a', 'b']));
    for (const p of report.perType) {
      expect(p.requested).toBe(p.placed + p.unplaced);
    }
    expect(getLayoutReport(layout)).toEqual(report);
  });

  it('empty (errored) layout → empty perType', () => {
    const layout = calculateLayout({ vehicle: V(2000, 2000, 2000), cargo: [] });
    expect(getLayoutReport(layout).perType).toEqual([]);
  });
});
