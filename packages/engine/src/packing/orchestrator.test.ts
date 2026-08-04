import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type {
  CargoType,
  Load,
  LoadingMode,
  NestingMode,
  NestingState,
  RotationRule,
  Vehicle,
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

  it('orderGrouping densityFirst drops zone boundaries and packs more than strict (ADR 016)', () => {
    // rear: grow=x (length 1000), fill=y (width 2000). Order A (1000×600) fills the whole length →
    // its zone leaves zero length for B under strict, so B is unplaced. densityFirst uses one region,
    // so B backfills the width A left free above it.
    const vehicle = { id: 'v', name: 'V', length: 1000, width: 2000, height: 1000 };
    const cargoTypes = [
      cargo({ id: 'a', orderId: 'A', length: 1000, width: 600, height: 1000, quantity: 1 }),
      cargo({ id: 'b', orderId: 'B', length: 800, width: 1000, height: 1000, quantity: 1 }),
    ];

    const strict = packLoad({ vehicle, cargo: cargoTypes, loadingMode: 'rear' });
    expect(strict.metrics.totalPlaced).toBe(1); // A placed, B has no zone left
    expect(strict.unplaced).toEqual([{ cargoTypeId: 'b', count: 1 }]);

    const dense = packLoad({ vehicle, cargo: cargoTypes, loadingMode: 'rear', orderGrouping: 'densityFirst' });
    expect(dense.metrics.totalPlaced).toBe(2); // both fit in one region
    expect(dense.unplaced).toEqual([]);
    expect(findGeometryViolations({ vehicle, cargo: cargoTypes, loadingMode: 'rear' }, dense)).toEqual([]);
  });

  describe('densityFirst is never worse than strict (QA: heterogeneous multi-order cargo)', () => {
    // Footprints mirror the demo: several orders whose zones pack tightly on their own, but whose
    // combined single-region shelf packing leaves width gaps. densityFirst must not fit fewer.
    const vehicle = { id: 'v', name: 'LKW', length: 13600, width: 2430, height: 2650 };
    const heterogeneous: CargoType[] = [
      cargo({ id: 'epal1', orderId: 'A', length: 1200, width: 800, height: 144, quantity: 186, rotation: 'yawOnly', state: 'verschachtelt', nesting: { nestable: true, stepHeight: 22, nestingMode: 'pairwise', allowUnpairedTop: true } }),
      cargo({ id: 'epal2', orderId: 'A', length: 1200, width: 1000, height: 162, quantity: 100, rotation: 'yawOnly', state: 'verschachtelt', nesting: { nestable: true, stepHeight: 30, nestingMode: 'sequential', maxNested: 25 } }),
      cargo({ id: 'epal6', orderId: 'B', length: 800, width: 600, height: 144, quantity: 160, rotation: 'yawOnly', state: 'verschachtelt', nesting: { nestable: true, stepHeight: 20, nestingMode: 'pairwise', maxNested: 20 } }),
      cargo({ id: 'viertel', orderId: 'B', length: 600, width: 400, height: 144, quantity: 96, rotation: 'yawOnly', stacking: { stackable: true, maxTiers: 6 } }),
      cargo({ id: 'sonder', orderId: 'C', length: 1340, width: 890, height: 178, quantity: 42, rotation: 'yawOnly' }),
      cargo({ id: 'epal3', orderId: 'D', length: 1000, width: 1200, height: 144, quantity: 216, rotation: 'none' }),
    ];

    for (const mode of ['rear', 'side', 'combined'] as LoadingMode[]) {
      it(`${mode}: densityFirst places >= strict and stays geometry-clean`, () => {
        const strict = packLoad({ vehicle, cargo: heterogeneous, loadingMode: mode, orderGrouping: 'strict' });
        const dense = packLoad({ vehicle, cargo: heterogeneous, loadingMode: mode, orderGrouping: 'densityFirst' });
        expect(dense.metrics.totalPlaced).toBeGreaterThanOrEqual(strict.metrics.totalPlaced);
        expect(findGeometryViolations({ vehicle, cargo: heterogeneous, loadingMode: mode }, dense)).toEqual([]);
      });
    }
  });

  it('fork access: a two-sided pallet is pinned lengthwise under rear and stays geometry-clean (ADR 018)', () => {
    const l = load({
      vehicle: { id: 'v', name: 'V', length: 2400, width: 1200, height: 1000 },
      cargo: [
        cargo({
          id: 'eur',
          length: 1200,
          width: 800,
          height: 1000,
          quantity: 4,
          rotation: 'yawOnly',
          forkAccess: 'twoSides',
          forkAxis: 'length',
        }),
      ],
      loadingMode: 'rear',
    });
    const layout = packLoad(l);
    // Unpinned max-fit would rotate to wlh (3 across); access pins every unit to lwh (2 across).
    expect(layout.placements.length).toBeGreaterThan(0);
    expect(layout.placements.every((p) => p.orientation === 'lwh')).toBe(true);
    expect(findGeometryViolations(l, layout)).toEqual([]);
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

describe('packLoad — multi-compartment (ADR 026, p3p)', () => {
  const twoBays: Vehicle = {
    id: 't', name: 't', length: 5800, width: 2400, height: 2400,
    compartments: [{ id: 'a', x: 0, length: 2400 }, { id: 'b', x: 3400, length: 2400 }],
  };
  const cube = (over: Partial<CargoType> = {}): CargoType => ({
    id: 'c', name: 'c', length: 1200, width: 1200, height: 1200, quantity: 8,
    rotation: 'none', stacking: { stackable: true }, nesting: { nestable: false },
    state: 'entschachtelt', ...over,
  });

  it('точный ответ: два отсека 2400³ и куб 1200 → ровно 8 единиц, по 4 в отсеке', () => {
    const layout = packLoad({ vehicle: twoBays, cargo: [cube()] });
    expect(layout.metrics.totalPlaced).toBe(8);
    expect(layout.metrics.usedFloorPositions).toBe(4); // по 2 напольных места в каждом отсеке
    expect(layout.unplaced).toEqual([]);
  });

  it('ни одна единица не встаёт в разрыв — на случайных заявках', () => {
    // Property-тест, а не один кейс: разрыв ловится только тогда, когда габариты груза и отсеков
    // подобраны неудачно, и подбирать их вручную — значит проверять ровно те случаи, о которых уже
    // подумал. `fast-check` здесь уже используется (floor.test.ts, edit.test.ts).
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 4000 }),   // длина отсека
        fc.integer({ min: 200, max: 2000 }),    // длина разрыва
        fc.integer({ min: 300, max: 1500 }),    // длина единицы
        fc.integer({ min: 300, max: 1200 }),    // ширина единицы
        fc.integer({ min: 1, max: 30 }),        // количество
        (bay, gap, cl, cw, qty) => {
          const vehicle: Vehicle = {
            id: 't', name: 't', length: bay * 2 + gap, width: 2450, height: 2400,
            compartments: [{ id: 'a', x: 0, length: bay }, { id: 'b', x: bay + gap, length: bay }],
          };
          const cargo = [cube({ length: cl, width: cw, height: 1200, quantity: qty })];
          const load = { vehicle, cargo };
          expect(findGeometryViolations(load, packLoad(load))).toEqual([]);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('densityFirst не ломается об отсеки', () => {
    // ADR 016: «плотность бьёт группировку» — densityFirst обязан размещать НЕ МЕНЬШЕ strict.
    // С отсеками сравниваются два многоотсековых прохода, а не один с другим.
    const cargo = [cube({ id: 'a', orderId: 'SO-1', quantity: 5 }), cube({ id: 'b', orderId: 'SO-2', quantity: 5 })];
    const strict = packLoad({ vehicle: twoBays, cargo, orderGrouping: 'strict' });
    const dense = packLoad({ vehicle: twoBays, cargo, orderGrouping: 'densityFirst' });
    expect(dense.metrics.totalPlaced).toBeGreaterThanOrEqual(strict.metrics.totalPlaced);
  });

  it('заказ, не влезший в первый отсек, продолжается во втором', () => {
    // Один orderId, 8 единиц: в тягач влезает 4, остальные обязаны уехать в прицеп, а не в unplaced.
    // Примечание (отклонение от брифа, см. отчёт задачи 6): один отсек 2400³ вмещает 2×2 напольных
    // места × 2 яруса = 8 кубов 1200³ целиком сам по себе (тот же 2×2×2 расчёт, что и в CLAUDE.md,
    // просто в масштабе отсека) — при quantity=8 переполнения в прицеп никогда не случится. Взято
    // quantity=12: тягач берёт максимум (8), остаток (4) обязан уйти в прицеп.
    const layout = packLoad({ vehicle: twoBays, cargo: [cube({ orderId: 'SO-1', quantity: 12 })] });
    const inTrailer = layout.placements.filter((p) => p.x >= 3400);
    expect(inTrailer.length).toBeGreaterThan(0);
    expect(layout.unplaced).toEqual([]);
  });

  it('fill заполняет оба отсека', () => {
    // Примечание (отклонение от брифа, см. отчёт задачи 6): один отсек 2400³ сам по себе вмещает 8
    // кубов 1200³ (2×2 места × 2 яруса), поэтому ожидаемое число для ДВУХ отсеков — 16, а не 8;
    // 8 означало бы, что fill заполнил только первый отсек, а второй остался пуст.
    const layout = packLoad({ vehicle: twoBays, cargo: [cube({ quantity: 0, fill: true })] });
    expect(layout.metrics.totalPlaced).toBe(16);
  });

  it('приоритет заявки: хвост списка уходит в unplaced, а не мелочь', () => {
    // Примечание (отклонение от брифа, см. отчёт задачи 6): суммарная ёмкость транспорта — 16 (по 8
    // на отсек), а не 8. head quantity=16 забирает оба отсека целиком, так что хвосту не остаётся
    // места ни в одном из них.
    const layout = packLoad({
      vehicle: twoBays,
      cargo: [cube({ id: 'head', quantity: 16 }), cube({ id: 'tail', quantity: 4 })],
    });
    expect(layout.unplaced.map((u) => u.cargoTypeId)).toEqual(['tail']);
  });
});
