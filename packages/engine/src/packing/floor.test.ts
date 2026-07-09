import { describe, it, expect } from 'vitest';
import type { CargoType, Layout, Load, Placement } from '../model/index';
import { packFloor, type FloorRequest } from './floor';
import { findGeometryViolations } from '../geometry/geometry';

const FLOOR = { length: 13600, width: 2430 };

function eur(count = 100000): FloorRequest {
  return { cargoTypeId: 'eur', length: 1200, width: 800, rotation: 'yawOnly', count };
}

function toLayout(placements: Placement[]): Layout {
  return {
    placements,
    unplaced: [],
    metrics: {
      totalPlaced: placements.length,
      usedFloorPositions: placements.length,
      floorFillPercent: 0,
      volumeFillPercent: 0,
    },
    contractVersion: '0.2.0',
  };
}

describe('packFloor (qrd.4)', () => {
  it('places 33 EUR pallets on a 13600x2430 floor', () => {
    expect(packFloor(FLOOR, [eur()], 0)).toHaveLength(33);
  });

  it('places 20 Gitterbox (1240x835) on a 13600x2430 floor', () => {
    const gb: FloorRequest = { cargoTypeId: 'gb', length: 1240, width: 835, rotation: 'yawOnly', count: 100000 };
    expect(packFloor(FLOOR, [gb], 0)).toHaveLength(20);
  });

  it('produces a floor plan with no geometry violations', () => {
    const placements = packFloor(FLOOR, [eur()], 0).map<Placement>((fp) => ({
      cargoTypeId: fp.cargoTypeId,
      x: fp.x,
      y: fp.y,
      z: 0,
      orientation: fp.orientation,
      tier: 1,
      state: 'entschachtelt',
    }));
    const cargo: CargoType = {
      id: 'eur',
      name: 'EUR',
      length: 1200,
      width: 800,
      height: 144,
      quantity: 100000,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
    };
    const load: Load = { vehicle: { id: 'v', name: 'V', length: 13600, width: 2430, height: 2650 }, cargo: [cargo], clearance: 0 };
    expect(findGeometryViolations(load, toLayout(placements))).toEqual([]);
  });

  it('respects the requested count', () => {
    expect(packFloor(FLOOR, [eur(10)], 0)).toHaveLength(10);
  });

  it('places fewer items when a clearance is applied', () => {
    expect(packFloor(FLOOR, [eur()], 50).length).toBeLessThan(33);
  });
});
