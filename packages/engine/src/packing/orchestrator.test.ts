import { describe, it, expect } from 'vitest';
import type { CargoType } from '../model/index';
import { columnPlacements } from './orchestrator';

describe('columnPlacements', () => {
  it('places entschachtelt cargo units as separate tiers with dz=height', () => {
    const cargo: CargoType = {
      id: 'entsch-cargo',
      name: 'Test Entschachtelt',
      length: 800,
      width: 600,
      height: 1000,
      quantity: 2,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: false },
      state: 'entschachtelt',
    };

    const placements = columnPlacements(cargo, 100, 50, 'lwh', 2);

    expect(placements).toHaveLength(2);

    // First placement at z=0, tier 1
    expect(placements[0]).toEqual({
      cargoTypeId: 'entsch-cargo',
      x: 100,
      y: 50,
      z: 0,
      orientation: 'lwh',
      tier: 1,
      state: 'entschachtelt',
    });

    // Second placement at z=1000, tier 2
    expect(placements[1]).toEqual({
      cargoTypeId: 'entsch-cargo',
      x: 100,
      y: 50,
      z: 1000,
      orientation: 'lwh',
      tier: 2,
      state: 'entschachtelt',
    });
  });

  it('places verschachtelt cargo units as nested stack with dz=stepHeight', () => {
    const cargo: CargoType = {
      id: 'versch-cargo',
      name: 'Test Verschachtelt',
      length: 800,
      width: 600,
      height: 144,
      quantity: 3,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: true, stepHeight: 22 },
      state: 'verschachtelt',
    };

    const placements = columnPlacements(cargo, 0, 0, 'lwh', 3);

    expect(placements).toHaveLength(3);

    // Tier 1 at z=0
    expect(placements[0]).toEqual({
      cargoTypeId: 'versch-cargo',
      x: 0,
      y: 0,
      z: 0,
      orientation: 'lwh',
      tier: 1,
      state: 'verschachtelt',
    });

    // Tier 2 at z=22
    expect(placements[1]).toEqual({
      cargoTypeId: 'versch-cargo',
      x: 0,
      y: 0,
      z: 22,
      orientation: 'lwh',
      tier: 2,
      state: 'verschachtelt',
    });

    // Tier 3 at z=44
    expect(placements[2]).toEqual({
      cargoTypeId: 'versch-cargo',
      x: 0,
      y: 0,
      z: 44,
      orientation: 'lwh',
      tier: 3,
      state: 'verschachtelt',
    });
  });
});
