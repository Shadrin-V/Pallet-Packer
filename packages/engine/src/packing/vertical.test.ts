import { describe, it, expect } from 'vitest';
import type { CargoType } from '../model/index';
import { computeVerticalStack } from './vertical';

function cargo(over: Partial<CargoType> = {}): CargoType {
  return {
    id: 'g',
    name: 'Gestell',
    length: 800,
    width: 1200,
    height: 144,
    quantity: 100,
    rotation: 'yawOnly',
    stacking: { stackable: true },
    nesting: { nestable: true, stepHeight: 22, nestingMode: 'pairwise' },
    state: 'verschachtelt',
    ...over,
  };
}

describe('computeVerticalStack (ADR 009)', () => {
  it('entschachtelt: full-height tiers up to vehicle height', () => {
    const c = cargo({ state: 'entschachtelt', height: 1000 });
    const r = computeVerticalStack(c, 2650);
    expect(r.count).toBe(2); // floor(2650/1000)
    expect(r.mode).toBe('entschachtelt');
  });

  it('entschachtelt: respects maxTiers', () => {
    const c = cargo({ state: 'entschachtelt', height: 500, stacking: { stackable: true, maxTiers: 3 } });
    expect(computeVerticalStack(c, 2650).count).toBe(3); // floor(2650/500)=5 -> 3
  });

  it('entschachtelt: not stackable is a single tier', () => {
    const c = cargo({ state: 'entschachtelt', height: 500, stacking: { stackable: false } });
    expect(computeVerticalStack(c, 2650).count).toBe(1);
  });

  it('sequential: H + (n-1)*step <= Hk', () => {
    const c = cargo({ height: 1050, nesting: { nestable: true, stepHeight: 150, nestingMode: 'sequential' } });
    const r = computeVerticalStack(c, 2650);
    expect(r.count).toBe(11); // 1 + floor((2650-1050)/150)
    expect(r.mode).toBe('sequential');
  });

  it('pairwise 5a: H=144, h_д=22, Hk=2650 -> n=31, height=2634', () => {
    const r = computeVerticalStack(cargo({ height: 144 }), 2650);
    expect(r.count).toBe(31);
    expect(r.height).toBe(2634);
    expect(r.pairs).toBe(15);
    expect(r.unpairedTop).toBe(false);
  });

  it('pairwise 5b: allowUnpairedTop true -> 32, false -> 31 at Hk=2790', () => {
    const base = { nestable: true, stepHeight: 22, nestingMode: 'pairwise' as const };
    expect(
      computeVerticalStack(cargo({ height: 144, nesting: { ...base, allowUnpairedTop: true } }), 2790).count,
    ).toBe(32);
    expect(
      computeVerticalStack(cargo({ height: 144, nesting: { ...base, allowUnpairedTop: false } }), 2790).count,
    ).toBe(31);
  });

  it('pairwise 5c: maxNested=6 -> 1 + 2 pairs + unpaired (n=6)', () => {
    const c = cargo({
      height: 144,
      nesting: { nestable: true, stepHeight: 22, nestingMode: 'pairwise', maxNested: 6, allowUnpairedTop: true },
    });
    const r = computeVerticalStack(c, 2650);
    expect(r.count).toBe(6);
    expect(r.pairs).toBe(2);
    expect(r.unpairedTop).toBe(true);
  });

  it('pairwise 5d: n_full=9, maxNested=6, allowUnpairedTop=false -> n=5', () => {
    const c = cargo({
      height: 144,
      nesting: { nestable: true, stepHeight: 22, nestingMode: 'pairwise', maxNested: 6, allowUnpairedTop: false },
    });
    const r = computeVerticalStack(c, 900); // k=4 -> n_full=9
    expect(r.count).toBe(5);
    expect(r.pairs).toBe(2);
    expect(r.unpairedTop).toBe(false);
  });

  it('returns 0 units when the cargo is taller than the vehicle', () => {
    expect(computeVerticalStack(cargo({ height: 3000 }), 2650).count).toBe(0);
  });
});
