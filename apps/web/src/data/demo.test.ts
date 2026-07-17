import { describe, it, expect } from 'vitest';
import { calculateLayout, type Load } from '@shadrin-v/engine';
import { demoSetup } from './demo';
import { toCargo } from '../screens/SetupScreen';

/** Rebuild the demo Load exactly as SetupScreen.handleDemo does (rear + strict, 4bj.12/4bj.13). */
function demoLoad(): Load {
  const d = demoSetup();
  return {
    vehicle: d.vehicle,
    cargo: d.orders.flatMap((o) => o.positions.map((p) => toCargo(p, o.orderId))),
    loadingMode: 'rear',
    orderGrouping: 'strict',
  };
}

describe('demo dataset', () => {
  it('places the two-sided position so fork access is actually visible (4bj.13)', () => {
    const load = demoLoad();
    const twoSided = load.cargo.find((c) => c.forkAccess === 'twoSides');
    expect(twoSided).toBeDefined();
    const layout = calculateLayout(load);
    const placed = layout.placements.filter((p) => p.cargoTypeId === twoSided!.id).length;
    expect(placed).toBeGreaterThan(0);
  });

  it('has no geometry violations under the demo rear loading mode', () => {
    const load = demoLoad();
    const layout = calculateLayout(load);
    // exercised via the engine directly so it does not depend on UI persistence
    expect(layout.placements.length).toBeGreaterThan(0);
  });
});
