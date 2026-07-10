import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  CargoType,
  Load,
  LoadingMode,
  NestingMode,
  NestingState,
  RotationRule,
} from '../model/index';
import { findGeometryViolations } from '../geometry/geometry';
import { columnPlacements, packLoad } from './orchestrator';
import { computeVerticalStack } from './vertical';

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

  it('pairwise column reaches the true stack height (qrd.22), not a collapsed t·h_д', () => {
    const c: CargoType = {
      id: 'pw',
      name: 'Pairwise',
      length: 800,
      width: 600,
      height: 144,
      quantity: 100,
      rotation: 'yawOnly',
      stacking: { stackable: true },
      nesting: { nestable: true, stepHeight: 22, nestingMode: 'pairwise' },
      state: 'verschachtelt',
    };
    const stack = computeVerticalStack(c, 2650); // n and true height
    const placements = columnPlacements(c, 0, 0, 'lwh', stack.count);

    expect(placements).toHaveLength(stack.count);
    // bottom at 0; top pallet top (z + H) equals the computed stack height, not the old ~t·22 collapse.
    const topZ = Math.max(...placements.map((p) => p.z));
    expect(placements[0].z).toBe(0);
    expect(topZ + c.height).toBe(stack.height);
    expect(topZ + c.height).toBeGreaterThan(2500); // ~full 2650 hold, not ~800
    // every tier fits under the hold.
    for (const p of placements) expect(p.z + c.height).toBeLessThanOrEqual(2650);
  });
});

function cargo(over: Partial<CargoType> = {}): CargoType {
  return {
    id: 'c',
    name: 'C',
    length: 1,
    width: 1,
    height: 1,
    quantity: 1,
    rotation: 'none',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...over,
  };
}

function load(over: Partial<Load> = {}): Load {
  return {
    vehicle: { id: 'v', name: 'V', length: 2, width: 2, height: 2 },
    cargo: [cargo()],
    ...over,
  };
}

describe('packLoad (qrd.7)', () => {
  it('trivial (CLAUDE.md): vehicle 2x2x2, cargo 1x1x1 quantity 100 -> totalPlaced 8, geometry clean', () => {
    const l = load({ cargo: [cargo({ id: 'unit', quantity: 100 })] });
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(8);
    expect(findGeometryViolations(l, layout)).toEqual([]);
  });

  it('fill:true places floor+vertical capacity and leaves unplaced empty', () => {
    const l = load({ cargo: [cargo({ id: 'unit', fill: true, quantity: 0 })] });
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(8);
    expect(layout.unplaced).toEqual([]);
    expect(findGeometryViolations(l, layout)).toEqual([]);
  });

  it('quantity exceeding capacity leaves the remainder in unplaced', () => {
    const l = load({ cargo: [cargo({ id: 'unit', quantity: 10 })] });
    const layout = packLoad(l);
    expect(layout.unplaced).toEqual([{ cargoTypeId: 'unit', count: 2 }]);
    expect(layout.metrics.totalPlaced).toBeLessThanOrEqual(10);
  });

  it('cargo bigger than the vehicle in every dimension places nothing; all unplaced', () => {
    const l = load({
      vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 1000 },
      cargo: [cargo({ id: 'big', length: 2000, width: 2000, height: 2000, quantity: 5 })],
    });
    const layout = packLoad(l);
    expect(layout.placements).toEqual([]);
    expect(layout.unplaced).toEqual([{ cargoTypeId: 'big', count: 5 }]);
    expect(layout.metrics.totalPlaced).toBe(0);
  });

  it('zones: orderId groups sit in adjacent x-ranges, A before B', () => {
    const l = load({
      vehicle: { id: 'v', name: 'V', length: 4000, width: 1000, height: 1000 },
      cargo: [
        cargo({ id: 'a', orderId: 'A', length: 1000, width: 1000, height: 1000, quantity: 2 }),
        cargo({ id: 'b', orderId: 'B', length: 1000, width: 1000, height: 1000, quantity: 2 }),
      ],
    });
    const layout = packLoad(l);
    const aX = layout.placements.filter((p) => p.cargoTypeId === 'a').map((p) => p.x);
    const bX = layout.placements.filter((p) => p.cargoTypeId === 'b').map((p) => p.x);
    expect(aX.length).toBeGreaterThan(0);
    expect(bX.length).toBeGreaterThan(0);
    expect(Math.min(...bX)).toBeGreaterThanOrEqual(Math.max(...aX));
    expect(findGeometryViolations(l, layout)).toEqual([]);
  });

  it('loadingMode default (combined): homogeneous load grows along x', () => {
    const l = load({
      vehicle: { id: 'v', name: 'V', length: 2000, width: 1000, height: 1000 },
      cargo: [
        cargo({
          id: 'r',
          length: 500,
          width: 1000,
          height: 1000,
          quantity: 100,
          stacking: { stackable: false },
        }),
      ],
    });
    const layout = packLoad(l);
    expect(new Set(layout.placements.map((p) => p.x))).toEqual(new Set([0, 500, 1000, 1500]));
    expect(layout.placements.every((p) => p.y === 0)).toBe(true);
    expect(findGeometryViolations(l, layout)).toEqual([]);
  });

  it('is deterministic: two calls with the same Load deep-equal', () => {
    const l = load({ cargo: [cargo({ id: 'unit', quantity: 20 })] });
    expect(packLoad(l)).toEqual(packLoad(l));
  });
});

describe('packLoad — regression (qrd.7 whole-branch review): column dz vs computeVerticalStack', () => {
  it('verschachtelt + nestable:false + pairwise, no stepHeight: dz falls back to 0, no OOB', () => {
    // Contract-valid degenerate input: stepHeight validation is gated on nestable:true (validate.ts),
    // so nestable:false + state:'verschachtelt' + nestingMode:'pairwise' with no stepHeight is legal.
    // computeVerticalStack (pairwise, hd = stepHeight ?? 0 = 0) reports a tight count of 5 for
    // H=1000, Hk=3000 (1 bottom single + 2 pairs, pairAdd=H). columnPlacements must not space those
    // 5 tiers by full cargo.height (which would put the column at 5*1000=5000mm, over the 3000mm hold).
    const l = load({
      vehicle: { id: 'v', name: 'V', length: 1000, width: 1000, height: 3000 },
      cargo: [
        cargo({
          id: 'nested-fallback',
          length: 800,
          width: 600,
          height: 1000,
          quantity: 5,
          state: 'verschachtelt',
          nesting: { nestable: false, nestingMode: 'pairwise' },
        }),
      ],
    });
    const layout = packLoad(l);
    expect(layout.metrics.totalPlaced).toBe(5);
    expect(findGeometryViolations(l, layout)).toEqual([]);
  });
});

/**
 * Cargo arbitrary: small dims, random rotation/state/nesting/orderId; ids assigned by array index.
 * `nestable` and `state` vary independently (NOT hard-coupled: a validated load only requires
 * stepHeight when nestable:true — validate.ts — but the packer itself keys off `state`, not
 * `nestable`; see the regression test above), and `stepHeight` is sometimes omitted, so the
 * generator can reach the nested + no-stepHeight fallback path (qrd.7 review).
 */
function arbCargo(): fc.Arbitrary<CargoType> {
  return fc
    .record({
      length: fc.integer({ min: 50, max: 800 }),
      width: fc.integer({ min: 50, max: 800 }),
      height: fc.integer({ min: 50, max: 800 }),
      quantity: fc.integer({ min: 0, max: 30 }),
      rotation: fc.constantFrom<RotationRule>('none', 'yawOnly', 'full'),
      state: fc.constantFrom<NestingState>('verschachtelt', 'entschachtelt'),
      nestable: fc.boolean(),
      nestingMode: fc.constantFrom<NestingMode>('sequential', 'pairwise'),
      allowUnpairedTop: fc.boolean(),
      stackable: fc.boolean(),
      maxTiers: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
      maxNested: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined }),
      orderId: fc.option(fc.constantFrom('A', 'B'), { nil: undefined }),
    })
    .chain((base) =>
      fc
        .option(fc.integer({ min: 1, max: base.height }), { nil: undefined })
        .map((stepHeight) => ({ ...base, stepHeight })),
    )
    .map(
      (g): CargoType => ({
        id: 'x',
        name: 'x',
        length: g.length,
        width: g.width,
        height: g.height,
        quantity: g.quantity,
        fill: false,
        rotation: g.rotation,
        stacking: { stackable: g.stackable, maxTiers: g.maxTiers },
        nesting: {
          nestable: g.nestable,
          stepHeight: g.stepHeight,
          maxNested: g.maxNested,
          nestingMode: g.nestingMode,
          allowUnpairedTop: g.allowUnpairedTop,
        },
        state: g.state,
        orderId: g.orderId,
      }),
    );
}

/** Load arbitrary: random vehicle bounds, clearance, loadingMode, 0..4 cargo types (unique ids by index). */
const arbLoad: fc.Arbitrary<Load> = fc
  .record({
    vLength: fc.integer({ min: 300, max: 4000 }),
    vWidth: fc.integer({ min: 300, max: 3000 }),
    vHeight: fc.integer({ min: 300, max: 3000 }),
    clearance: fc.integer({ min: 0, max: 20 }),
    loadingMode: fc.option(fc.constantFrom<LoadingMode>('rear', 'side', 'combined'), { nil: undefined }),
    cargo: fc.array(arbCargo(), { minLength: 0, maxLength: 4 }),
  })
  .map((r) => ({
    vehicle: { id: 'v', name: 'V', length: r.vLength, width: r.vWidth, height: r.vHeight },
    cargo: r.cargo.map((c, i) => ({ ...c, id: `c${i}`, name: `c${i}` })),
    clearance: r.clearance,
    loadingMode: r.loadingMode,
  }));

describe('packLoad — property: geometry-clean, bounded, deterministic', () => {
  it('holds for random loads', () => {
    fc.assert(
      fc.property(arbLoad, (rndLoad) => {
        const layout1 = packLoad(rndLoad);
        const layout2 = packLoad(rndLoad);
        expect(layout1).toEqual(layout2);
        expect(findGeometryViolations(rndLoad, layout1)).toEqual([]);
        const totalQuantity = rndLoad.cargo.reduce((sum, c) => sum + c.quantity, 0);
        expect(layout1.metrics.totalPlaced).toBeLessThanOrEqual(totalQuantity);
      }),
    );
  });
});
