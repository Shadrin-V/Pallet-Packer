import { describe, it, expect } from 'vitest';
import { allowedOrientations, floorOrientations, orientedDims } from './orientation';

describe('allowedOrientations (notional, ADR 013)', () => {
  it('none -> [lwh]', () => expect(allowedOrientations('none')).toEqual(['lwh']));
  it('yawOnly -> [lwh, wlh]', () => expect(allowedOrientations('yawOnly')).toEqual(['lwh', 'wlh']));
  it('full -> all six in canonical order', () =>
    expect(allowedOrientations('full')).toEqual(['lwh', 'wlh', 'lhw', 'hlw', 'whl', 'hwl']));
});

describe('floorOrientations (MVP packer, full ≈ yaw)', () => {
  it('none -> [lwh]', () => expect(floorOrientations('none')).toEqual(['lwh']));
  it('yawOnly -> [lwh, wlh]', () => expect(floorOrientations('yawOnly')).toEqual(['lwh', 'wlh']));
  it('full -> [lwh, wlh] (tipping deferred)', () =>
    expect(floorOrientations('full')).toEqual(['lwh', 'wlh']));
});

describe('orientedDims (axis mapping l/w/h -> x/y/z)', () => {
  const l = 100;
  const w = 200;
  const h = 300;
  it('lwh -> [l, w, h]', () => expect(orientedDims(l, w, h, 'lwh')).toEqual([100, 200, 300]));
  it('wlh -> [w, l, h]', () => expect(orientedDims(l, w, h, 'wlh')).toEqual([200, 100, 300]));
  it('lhw -> [l, h, w]', () => expect(orientedDims(l, w, h, 'lhw')).toEqual([100, 300, 200]));
  it('hlw -> [h, l, w]', () => expect(orientedDims(l, w, h, 'hlw')).toEqual([300, 100, 200]));
  it('whl -> [w, h, l]', () => expect(orientedDims(l, w, h, 'whl')).toEqual([200, 300, 100]));
  it('hwl -> [h, w, l]', () => expect(orientedDims(l, w, h, 'hwl')).toEqual([300, 200, 100]));
});
