import { describe, it, expect } from 'vitest';
import { chooseOrientation, fitCount, type FloorRequest } from './floor';

const REGION = { length: 13600, width: 2430 };

function req(over: Partial<FloorRequest> = {}): FloorRequest {
  return { cargoTypeId: 'c', length: 1200, width: 800, rotation: 'yawOnly', count: 1, ...over };
}

describe('fitCount', () => {
  it('counts items along a span (clearance 0)', () => {
    expect(fitCount(13600, 800, 0)).toBe(17);
    expect(fitCount(13600, 1200, 0)).toBe(11);
    expect(fitCount(2430, 1200, 0)).toBe(2);
  });

  it('returns 0 when the item is larger than the span', () => {
    expect(fitCount(1000, 1200, 0)).toBe(0);
  });

  it('applies clearance between items', () => {
    expect(fitCount(1000, 300, 100)).toBe(2); // 300+100+300=700<=1000; third would need 1100
  });
});

describe('chooseOrientation (max-fit, ADR 011)', () => {
  it('EUR fills more in wlh (34) than lwh (33)', () => {
    const fp = chooseOrientation(req({ length: 1200, width: 800, rotation: 'yawOnly' }), REGION, 0);
    expect(fp.orientation).toBe('wlh');
    expect([fp.dx, fp.dy]).toEqual([800, 1200]);
  });

  it('Gitterbox stays lwh (20 vs 16)', () => {
    const fp = chooseOrientation(req({ length: 1240, width: 835, rotation: 'yawOnly' }), REGION, 0);
    expect(fp.orientation).toBe('lwh');
  });

  it('rotation none forces lwh', () => {
    const fp = chooseOrientation(req({ length: 1200, width: 800, rotation: 'none' }), REGION, 0);
    expect(fp.orientation).toBe('lwh');
  });

  it('tie prefers lwh', () => {
    const fp = chooseOrientation(req({ length: 1000, width: 1000, rotation: 'yawOnly' }), REGION, 0);
    expect(fp.orientation).toBe('lwh');
  });
});

describe('chooseOrientation — fork access (ADR 018)', () => {
  // In REGION, an unpinned EUR maximises fill at wlh (34 > 33 lwh). A two-sided stack must present its
  // accessible pair to the loading door, so fork access can override that max-fit choice.
  const eur = (over: Partial<FloorRequest> = {}) =>
    req({ length: 1200, width: 800, rotation: 'yawOnly', ...over });

  it('all4 (default) leaves the max-fit choice untouched: EUR → wlh', () => {
    expect(chooseOrientation(eur(), REGION, 0, 'rear').orientation).toBe('wlh');
  });

  it('twoSides + forkAxis length pins to lwh under rear', () => {
    const fp = chooseOrientation(eur({ forkAccess: 'twoSides', forkAxis: 'length' }), REGION, 0, 'rear');
    expect(fp.orientation).toBe('lwh');
    expect([fp.dx, fp.dy]).toEqual([1200, 800]);
  });

  it('twoSides + forkAxis length pins to wlh under side', () => {
    const fp = chooseOrientation(eur({ forkAccess: 'twoSides', forkAxis: 'length' }), REGION, 0, 'side');
    expect(fp.orientation).toBe('wlh');
  });

  it('twoSides + forkAxis width pins to wlh under rear', () => {
    const fp = chooseOrientation(eur({ forkAccess: 'twoSides', forkAxis: 'width' }), REGION, 0, 'rear');
    expect(fp.orientation).toBe('wlh');
  });

  it('twoSides + forkAxis width pins to lwh under side', () => {
    const fp = chooseOrientation(eur({ forkAccess: 'twoSides', forkAxis: 'width' }), REGION, 0, 'side');
    expect(fp.orientation).toBe('lwh');
  });

  it('defaults forkAxis to length when omitted', () => {
    expect(chooseOrientation(eur({ forkAccess: 'twoSides' }), REGION, 0, 'rear').orientation).toBe('lwh');
  });

  it('combined does not pin — both doors keep either yaw accessible → max-fit (wlh)', () => {
    const fp = chooseOrientation(eur({ forkAccess: 'twoSides', forkAxis: 'length' }), REGION, 0, 'combined');
    expect(fp.orientation).toBe('wlh');
  });

  it('rotation none takes precedence: no yaw to constrain, stays lwh', () => {
    const fp = chooseOrientation(
      eur({ forkAccess: 'twoSides', forkAxis: 'width', rotation: 'none' }),
      REGION,
      0,
      'rear',
    );
    expect(fp.orientation).toBe('lwh');
  });
});

import { packFloor, type FloorPlacement } from './floor';

function eur(count = 100000): FloorRequest {
  return { cargoTypeId: 'eur', length: 1200, width: 800, rotation: 'yawOnly', count };
}

describe('packFloor — reference fills', () => {
  it('trivial exact: 2x2 region, 1x1 footprint -> 4', () => {
    const one: FloorRequest = { cargoTypeId: 'u', length: 1, width: 1, rotation: 'none', count: 100 };
    expect(packFloor({ length: 2, width: 2 }, [one])).toHaveLength(4);
  });

  it('EUR yawOnly on 13600x2430 -> 34 (side)', () => {
    expect(packFloor(REGION, [eur()], { loadingMode: 'side' })).toHaveLength(34);
  });

  it('EUR yawOnly on 13600x2430 -> 34 (rear)', () => {
    expect(packFloor(REGION, [eur()], { loadingMode: 'rear' })).toHaveLength(34);
  });

  it('Gitterbox 1240x835 -> 20', () => {
    const gb: FloorRequest = { cargoTypeId: 'gb', length: 1240, width: 835, rotation: 'yawOnly', count: 100000 };
    expect(packFloor(REGION, [gb], { loadingMode: 'side' })).toHaveLength(20);
  });

  it('rotation none -> 33 (swap forbidden)', () => {
    const eurNone: FloorRequest = { ...eur(), rotation: 'none' };
    expect(packFloor(REGION, [eurNone], { loadingMode: 'side' })).toHaveLength(33);
  });

  it('empty requests -> []', () => {
    expect(packFloor(REGION, [])).toEqual([]);
  });

  it('respects requested count', () => {
    expect(packFloor(REGION, [eur(10)], { loadingMode: 'side' })).toHaveLength(10);
  });
});

describe('packFloor — dense heuristic: best-fit + backfill (ADR 017)', () => {
  const r = (id: string, len: number): FloorRequest => ({
    cargoTypeId: id,
    length: len,
    width: 300,
    rotation: 'none',
    count: 1,
  });

  it('backfills an earlier shelf that next-fit abandoned', () => {
    // side: fill=length(1000), grow=width(650) → two 300-deep shelves fit (0,300), a third (600) does not.
    // a(400) opens shelf0; b(700) does not fit shelf0's 600 remainder → shelf1; c(700) fits neither and
    // cannot open shelf2. d(500) fits shelf0's 600mm remainder. Next-fit (active=shelf1) drops d; best-fit
    // backfills shelf0 → d placed.
    const region = { length: 1000, width: 650 };
    const out = packFloor(region, [r('a', 400), r('b', 700), r('c', 700), r('d', 500)], {
      loadingMode: 'side',
    });
    expect(out.map((p) => p.cargoTypeId).sort()).toEqual(['a', 'b', 'd']);
    const d = out.find((p) => p.cargoTypeId === 'd')!;
    expect([d.x, d.y]).toEqual([400, 0]); // backfilled into shelf0 (grow 0), after a
  });

  it('backfills a pocket behind a shorter stack in the same shelf (ymv)', () => {
    // rear: grow=x(len 1000), fill=y(width 1000). A is 1000 deep and sets the shelf depth; B is only
    // 600 deep → a 400×500 pocket stays empty behind it; C (400 deep) fits that pocket, and there is
    // no room to open a new shelf (grow is full). The shelf pass alone leaves C unplaced.
    const region = { length: 1000, width: 1000 };
    const A: FloorRequest = { cargoTypeId: 'a', length: 1000, width: 500, rotation: 'none', count: 1 };
    const B: FloorRequest = { cargoTypeId: 'b', length: 600, width: 500, rotation: 'none', count: 1 };
    const C: FloorRequest = { cargoTypeId: 'c', length: 400, width: 500, rotation: 'none', count: 1 };
    const out = packFloor(region, [A, B, C], { loadingMode: 'rear' });
    expect(out.map((p) => p.cargoTypeId).sort()).toEqual(['a', 'b', 'c']);
    const c = out.find((p) => p.cargoTypeId === 'c')!;
    expect([c.x, c.y, c.dx, c.dy]).toEqual([600, 500, 400, 500]); // placed in the pocket behind b
  });
});

describe('packFloor — fork access (ADR 018)', () => {
  it('rear loading places every two-sided EUR lengthwise (lwh 33), trading density for access', () => {
    const twoSided: FloorRequest = { ...eur(), forkAccess: 'twoSides', forkAxis: 'length' };
    const out = packFloor(REGION, [twoSided], { loadingMode: 'rear' });
    expect(out).toHaveLength(33); // lwh (33), not the max-fit wlh (34)
    expect(out.every((p) => p.orientation === 'lwh')).toBe(true);
  });

  it('all4 EUR keeps the max-fit 34 under rear (default, no constraint)', () => {
    expect(packFloor(REGION, [eur()], { loadingMode: 'rear' })).toHaveLength(34);
  });
});

describe('packFloor — orientation axis (rear vs side coords)', () => {
  it('side lays a non-square footprint growing along y', () => {
    const r: FloorRequest = { cargoTypeId: 'r', length: 1000, width: 500, rotation: 'none', count: 100 };
    const out = packFloor({ length: 1000, width: 2000 }, [r], { loadingMode: 'side' });
    // side: one column along x (1000), shelves stack along y at 0,500,1000,1500
    expect(new Set(out.map((p) => p.y))).toEqual(new Set([0, 500, 1000, 1500]));
    expect(out.every((p) => p.x === 0)).toBe(true);
  });

  it('rear lays the same footprint growing along x', () => {
    const r: FloorRequest = { cargoTypeId: 'r', length: 500, width: 1000, rotation: 'none', count: 100 };
    const out = packFloor({ length: 2000, width: 1000 }, [r], { loadingMode: 'rear' });
    // rear: one row along y (1000), shelves stack along x at 0,500,1000,1500
    expect(new Set(out.map((p) => p.x))).toEqual(new Set([0, 500, 1000, 1500]));
    expect(out.every((p) => p.y === 0)).toBe(true);
  });
});

describe('packFloor — combined (default)', () => {
  it('combined places max(rear, side) on a mixed load', () => {
    const region = { length: 3000, width: 2000 };
    const reqs: FloorRequest[] = [
      { cargoTypeId: 'A', length: 1200, width: 800, rotation: 'yawOnly', count: 10 },
      { cargoTypeId: 'B', length: 1000, width: 600, rotation: 'yawOnly', count: 10 },
    ];
    const rear = packFloor(region, reqs, { loadingMode: 'rear' }).length;
    const side = packFloor(region, reqs, { loadingMode: 'side' }).length;
    const combined = packFloor(region, reqs, { loadingMode: 'combined' }).length;
    expect(combined).toBe(Math.max(rear, side));
  });

  it('default mode is combined and deterministic', () => {
    const reqs = [eur()];
    expect(packFloor(REGION, reqs)).toEqual(packFloor(REGION, reqs, { loadingMode: 'combined' }));
    expect(packFloor(REGION, reqs)).toEqual(packFloor(REGION, reqs));
  });
});

import fc from 'fast-check';
import type { CargoType, Layout, Load, RotationRule } from '../model/index';
import type { LoadingMode } from './floor';
import { findGeometryViolations } from '../geometry/geometry';

describe('packFloor — clearance, priority, edges', () => {
  it('clearance reduces the count below 34', () => {
    expect(packFloor(REGION, [eur()], { clearance: 50, loadingMode: 'side' }).length).toBeLessThan(34);
  });

  it('places nothing when the footprint exceeds the region in both orientations', () => {
    const big: FloorRequest = { cargoTypeId: 'big', length: 5000, width: 5000, rotation: 'yawOnly', count: 3 };
    expect(packFloor({ length: 2000, width: 2000 }, [big])).toEqual([]);
  });

  it('respects input order as priority under space pressure', () => {
    const region = { length: 2000, width: 1000 };
    const A: FloorRequest = { cargoTypeId: 'A', length: 1000, width: 1000, rotation: 'none', count: 2 };
    const B: FloorRequest = { cargoTypeId: 'B', length: 1000, width: 1000, rotation: 'none', count: 5 };
    const out = packFloor(region, [A, B], { loadingMode: 'side' });
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.cargoTypeId === 'A')).toBe(true);
  });
});

function toLoadAndLayout(
  region: { length: number; width: number },
  requests: FloorRequest[],
  placements: FloorPlacement[],
): { load: Load; layout: Layout } {
  const cargo: CargoType[] = requests.map((r) => ({
    id: r.cargoTypeId,
    name: r.cargoTypeId,
    length: r.length,
    width: r.width,
    height: 100,
    quantity: r.count,
    rotation: r.rotation,
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
  }));
  const layout: Layout = {
    placements: placements.map((fp) => ({
      cargoTypeId: fp.cargoTypeId,
      x: fp.x,
      y: fp.y,
      z: 0,
      orientation: fp.orientation,
      tier: 1,
      state: 'entschachtelt',
    })),
    unplaced: [],
    metrics: { totalPlaced: placements.length, usedFloorPositions: placements.length, floorFillPercent: 0, volumeFillPercent: 0 },
    contractVersion: '0.0.0',
  };
  const load: Load = {
    vehicle: { id: 'v', name: 'v', length: region.length, width: region.width, height: 1000 },
    cargo,
  };
  return { load, layout };
}

describe('packFloor — property: no geometry violations', () => {
  it('never overlaps or exceeds bounds for random inputs', () => {
    const arbReq = fc.record({
      length: fc.integer({ min: 100, max: 3000 }),
      width: fc.integer({ min: 100, max: 3000 }),
      rotation: fc.constantFrom<RotationRule>('none', 'yawOnly', 'full'),
      count: fc.integer({ min: 0, max: 40 }),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 500, max: 14000 }),
        fc.integer({ min: 500, max: 3000 }),
        fc.array(arbReq, { minLength: 0, maxLength: 5 }),
        fc.constantFrom<LoadingMode>('rear', 'side', 'combined'),
        fc.integer({ min: 0, max: 50 }),
        (L, W, rawReqs, mode, clearance) => {
          const region = { length: L, width: W };
          const requests: FloorRequest[] = rawReqs.map((r, i) => ({ cargoTypeId: `c${i}`, ...r }));
          const placements = packFloor(region, requests, { clearance, loadingMode: mode });
          const { load, layout } = toLoadAndLayout(region, requests, placements);
          expect(findGeometryViolations(load, layout)).toEqual([]);
        },
      ),
      { numRuns: 500 }, // best-fit + backfill is new logic (ADR 017) — stress it harder
    );
  });
});

describe('packFloor — rotation modes (qrd.6)', () => {
  it('full is treated as yaw: EUR full -> 34 in wlh', () => {
    const eurFull: FloorRequest = { ...eur(), rotation: 'full' };
    const out = packFloor(REGION, [eurFull], { loadingMode: 'side' });
    expect(out).toHaveLength(34);
    expect(out.every((p) => p.orientation === 'wlh')).toBe(true);
  });

  it('none never changes orientation (every placement lwh)', () => {
    const eurNone: FloorRequest = { ...eur(), rotation: 'none' };
    const out = packFloor(REGION, [eurNone], { loadingMode: 'side' });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.orientation === 'lwh')).toBe(true);
  });
});
