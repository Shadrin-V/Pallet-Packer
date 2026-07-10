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
