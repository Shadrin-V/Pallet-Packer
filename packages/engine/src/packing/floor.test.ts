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
