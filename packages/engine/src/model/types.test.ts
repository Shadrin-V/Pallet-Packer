import { describe, it, expect } from 'vitest';
import type { Vehicle, CargoType, Load, Layout, Placement, Report } from './types';

// Type correctness is enforced by `tsc --noEmit`; runtime asserts document the shapes.
describe('domain types (api-contract 0.1.0)', () => {
  it('models a Load with vehicle and cargo', () => {
    const vehicle: Vehicle = {
      id: 'lkw-std',
      name: 'LKW Standard',
      length: 13600,
      width: 2430,
      height: 2650,
    };
    const cargo: CargoType = {
      id: 'epal1',
      name: 'EPAL 1',
      length: 800,
      width: 1200,
      height: 144,
      quantity: 33,
      rotation: 'yawOnly',
      stacking: { stackable: true, maxTiers: 2 },
      nesting: { nestable: false },
      state: 'entschachtelt',
    };
    const load: Load = { vehicle, cargo: [cargo], clearance: 0, objective: 'maxUnits' };

    expect(load.cargo).toHaveLength(1);
    expect(load.vehicle.length).toBe(13600);
    expect(load.cargo[0].stacking.maxTiers).toBe(2);
  });

  it('models a Layout with placements, unplaced and metrics', () => {
    const placement: Placement = {
      cargoTypeId: 'epal1',
      x: 0,
      y: 0,
      z: 0,
      orientation: 'lwh',
      tier: 1,
      state: 'entschachtelt',
    };
    const layout: Layout = {
      placements: [placement],
      unplaced: [{ cargoTypeId: 'epal1', count: 5 }],
      metrics: {
        totalPlaced: 1,
        usedFloorPositions: 1,
        floorFillPercent: 50,
        volumeFillPercent: 40,
      },
      contractVersion: '0.1.0',
    };

    expect(layout.placements[0].orientation).toBe('lwh');
    expect(layout.unplaced[0].count).toBe(5);
  });

  it('models a Report with a layout and per-type totals', () => {
    const report: Report = {
      layout: {
        placements: [],
        unplaced: [],
        metrics: {
          totalPlaced: 0,
          usedFloorPositions: 0,
          floorFillPercent: 0,
          volumeFillPercent: 0,
        },
        contractVersion: '0.1.0',
      },
      perType: [{ cargoTypeId: 'epal1', requested: 10, placed: 0, unplaced: 10 }],
    };

    expect(report.perType[0].unplaced).toBe(10);
  });
});
