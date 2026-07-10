import { describe, it, expect } from 'vitest';
import type { CargoType, Vehicle } from '../model/index';
import { computeStack } from './api';

const V = (height: number): Vehicle => ({ id: 'v', name: 'v', length: 13600, width: 2430, height });

function pallet(over: Partial<CargoType> = {}): CargoType {
  return {
    id: 'p',
    name: 'p',
    length: 1200,
    width: 800,
    height: 144,
    quantity: 1,
    rotation: 'yawOnly',
    stacking: { stackable: true },
    nesting: { nestable: false },
    state: 'entschachtelt',
    ...over,
  };
}

describe('computeStack', () => {
  it('entschachtelt: floor(Hк/H) tiers', () => {
    // 2650 / 144 = 18
    const s = computeStack(pallet(), V(2650));
    expect(s.mode).toBe('entschachtelt');
    expect(s.count).toBe(18);
    expect(s.height).toBe(18 * 144);
  });

  it('entschachtelt respects maxTiers cap', () => {
    const s = computeStack(pallet({ stacking: { stackable: true, maxTiers: 5 } }), V(2650));
    expect(s.count).toBe(5);
  });

  it('entschachtelt non-stackable → single tier', () => {
    const s = computeStack(pallet({ stacking: { stackable: false } }), V(2650));
    expect(s.count).toBe(1);
  });

  it('verschachtelt sequential: 1 + floor((Hк-H)/Δh)', () => {
    // H=144, Δh=40, Hк=2650 → 1 + floor(2506/40) = 1 + 62 = 63
    const s = computeStack(
      pallet({ state: 'verschachtelt', nesting: { nestable: true, stepHeight: 40, nestingMode: 'sequential' } }),
      V(2650),
    );
    expect(s.mode).toBe('sequential');
    expect(s.count).toBe(63);
    expect(s.height).toBe(144 + 62 * 40);
  });

  it('verschachtelt pairwise reports pairs/unpairedTop', () => {
    const s = computeStack(
      pallet({
        state: 'verschachtelt',
        nesting: { nestable: true, stepHeight: 40, nestingMode: 'pairwise', maxNested: 5 },
      }),
      V(2650),
    );
    expect(s.mode).toBe('pairwise');
    expect(s.count).toBe(5);
    expect(s.pairs).toBe(2);
    expect(typeof s.unpairedTop).toBe('boolean');
  });

  it('cargo taller than hold → count 0', () => {
    const s = computeStack(pallet({ height: 3000 }), V(2650));
    expect(s.count).toBe(0);
  });

  it('is deterministic', () => {
    const c = pallet({ state: 'verschachtelt', nesting: { nestable: true, stepHeight: 40 } });
    expect(computeStack(c, V(2650))).toEqual(computeStack(c, V(2650)));
  });
});
