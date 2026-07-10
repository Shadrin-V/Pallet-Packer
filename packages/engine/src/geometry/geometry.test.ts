import { describe, it, expect } from 'vitest';
import type { CargoType, Layout, Load, Placement } from '../model/index';
import { findGeometryViolations } from './geometry';

function cargo(over: Partial<CargoType> = {}): CargoType {
  return {
    id: 'a',
    name: 'A',
    length: 400,
    width: 300,
    height: 200,
    quantity: 10,
    rotation: 'full',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...over,
  };
}

function load(cargoTypes: CargoType[] = [cargo()]): Load {
  return {
    vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 1000 },
    cargo: cargoTypes,
    clearance: 0,
  };
}

function place(over: Partial<Placement> = {}): Placement {
  return {
    cargoTypeId: 'a',
    x: 0,
    y: 0,
    z: 0,
    orientation: 'lwh',
    tier: 1,
    state: 'entschachtelt',
    ...over,
  };
}

function layout(placements: Placement[]): Layout {
  return {
    placements,
    unplaced: [],
    metrics: { totalPlaced: placements.length, usedFloorPositions: 0, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.2.0',
  };
}

const kinds = (l: Load, la: Layout) => findGeometryViolations(l, la).map((v) => v.kind);

describe('findGeometryViolations (qrd.9)', () => {
  it('reports no violations for a valid layout', () => {
    expect(findGeometryViolations(load(), layout([place()]))).toEqual([]);
  });

  it('detects a placement extending past the vehicle bounds', () => {
    // 400 wide along x starting at 800 -> ends at 1200 > 1000
    expect(kinds(load(), layout([place({ x: 800 })]))).toContain('out-of-bounds');
  });

  it('detects overlapping placements', () => {
    const a = place({ x: 0, y: 0 });
    const b = place({ x: 100, y: 100 }); // overlaps a (400x300 boxes)
    expect(kinds(load(), layout([a, b]))).toContain('overlap');
  });

  it('does not report overlap for adjacent (touching) placements', () => {
    const a = place({ x: 0 });
    const b = place({ x: 400 }); // starts exactly where a ends
    expect(kinds(load(), layout([a, b]))).not.toContain('overlap');
  });

  it('detects an orientation not allowed by the rotation rule', () => {
    const fixed = load([cargo({ rotation: 'none' })]);
    // rotation 'none' allows only 'lwh'
    expect(kinds(fixed, layout([place({ orientation: 'wlh' })]))).toContain('orientation');
  });

  it('accepts a yaw orientation when rotation is yawOnly', () => {
    const yaw = load([cargo({ rotation: 'yawOnly' })]);
    expect(kinds(yaw, layout([place({ orientation: 'wlh' })]))).not.toContain('orientation');
  });

  it('allows overlapping nested column placements with same cargoTypeId and x,y', () => {
    const cargoType = cargo({ id: 'a', state: 'verschachtelt' });
    const a = place({ cargoTypeId: 'a', x: 0, y: 0, z: 0, state: 'verschachtelt' });
    const b = place({ cargoTypeId: 'a', x: 0, y: 0, z: 100, state: 'verschachtelt' });
    expect(kinds(load([cargoType]), layout([a, b]))).not.toContain('overlap');
  });

  it('still detects overlap between different cargoTypeIds at same x,y', () => {
    const cargoA = cargo({ id: 'a', state: 'verschachtelt' });
    const cargoB = cargo({ id: 'b', state: 'verschachtelt' });
    const a = place({ cargoTypeId: 'a', x: 0, y: 0, z: 0 });
    const b = place({ cargoTypeId: 'b', x: 0, y: 0, z: 100 });
    expect(kinds(load([cargoA, cargoB]), layout([a, b]))).toContain('overlap');
  });
});
