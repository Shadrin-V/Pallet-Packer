import { describe, it, expect } from 'vitest';
import { calculateLayout, findGeometryViolations, type Load } from '@shadrin-v/engine';
import { demoSetup, DEMO_VARIANTS, type DemoVariant } from './demo';
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


/** Build the Load for a variant exactly as SetupScreen.handleDemo does. */
function loadOf(variant: DemoVariant): Load {
  const d = variant.build();
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

// Three variants, cycled in a FIXED order (rgv.5) — the app is deterministic by principle, so the
// demo carousel is a rotation, never Math.random.
describe('demo variants (rgv.5)', () => {
  it('offers exactly three variants with distinct keys', () => {
    expect(DEMO_VARIANTS).toHaveLength(3);
    expect(new Set(DEMO_VARIANTS.map((v) => v.key)).size).toBe(3);
  });

  it('every variant builds a geometry-valid plan (domain invariant)', () => {
    for (const variant of DEMO_VARIANTS) {
      const load = loadOf(variant);
      expect(findGeometryViolations(load, calculateLayout(load))).toEqual([]);
    }
  });

  it('every variant is deterministic: same placements on a rebuild', () => {
    for (const variant of DEMO_VARIANTS) {
      const a = calculateLayout(loadOf(variant));
      const b = calculateLayout(loadOf(variant));
      expect(a.placements.length).toBe(b.placements.length);
      expect(a.metrics).toEqual(b.metrics);
    }
  });

  it('variants differ from each other (a carousel of one is not a carousel)', () => {
    const shapes = DEMO_VARIANTS.map((v) =>
      loadOf(v)
        .cargo.map((c) => `${c.name}:${c.quantity}`)
        .join('|'),
    );
    expect(new Set(shapes).size).toBe(3);
  });

  it('"nesting" showcases nesting: it has verschachtelt positions in both modes', () => {
    const cargo = loadOf(DEMO_VARIANTS.find((v) => v.key === 'nesting')!).cargo;
    const nested = cargo.filter((c) => c.state === 'verschachtelt' && c.nesting.nestable);
    expect(nested.length).toBeGreaterThan(1);
    expect(new Set(nested.map((c) => c.nesting.nestingMode))).toEqual(new Set(['sequential', 'pairwise']));
    // …and an entschachtelt position next to them, so the contrast is visible
    expect(cargo.some((c) => c.state === 'entschachtelt')).toBe(true);
  });

  it('"overload" showcases the unplaced path and two-sided fork access', () => {
    const load = loadOf(DEMO_VARIANTS.find((v) => v.key === 'overload')!);
    expect(load.cargo.some((c) => c.forkAccess === 'twoSides')).toBe(true);
    const layout = calculateLayout(load);
    expect(layout.unplaced.reduce((s, u) => s + u.count, 0)).toBeGreaterThan(0);
    expect(layout.placements.length).toBeGreaterThan(0);
  });
});
