import { describe, it, expect, beforeEach } from 'vitest';
import {
  SETUP_STORAGE_KEY, emptyOrder, emptyPosition, loadSetup, nextColorIndex, nextOrderNumber, toCargo,
} from './setupState';

describe('nextOrderNumber', () => {
  it('is the highest SO-n plus one, so a deletion frees no number', () => {
    const os = [emptyOrder(1), emptyOrder(2)];
    expect(nextOrderNumber([os[1]])).toBe(3);
  });
  it('ignores orders renamed away from SO-n', () => {
    expect(nextOrderNumber([{ ...emptyOrder(1), orderId: 'AB-77' }])).toBe(1);
  });
});

describe('nextColorIndex', () => {
  it('is the lowest free slot, independent of the order id', () => {
    const renamed = { ...emptyOrder(1), orderId: 'AB-77', colorIndex: 0 };
    expect(nextColorIndex([renamed])).toBe(1);
  });
});

describe('toCargo', () => {
  it('drops nesting when the step is missing, even in verschachtelt', () => {
    const p = { ...emptyPosition(), height: 100, state: 'verschachtelt' as const, nestStepPairwise: '' as const };
    expect(toCargo(p, 'SO-1').nesting).toEqual({ nestable: false });
  });
  it('keeps forkAxis only for two-sided access', () => {
    const p = { ...emptyPosition(), forkAccess: 'twoSides' as const, forkAxis: 'width' as const };
    expect(toCargo(p, 'SO-1')).toMatchObject({ forkAccess: 'twoSides', forkAxis: 'width' });
    expect(toCargo(emptyPosition(), 'SO-1')).not.toHaveProperty('forkAxis');
  });
});

describe('loadSetup', () => {
  beforeEach(() => globalThis.localStorage?.clear());

  it('migrates a legacy draft that carries a single stepHeight', () => {
    const legacy = {
      vehicle: { id: 'v', name: 'v', length: 1, width: 1, height: 1 },
      orders: [{ key: 'k', orderId: 'SO-1', positions: [{ ...emptyPosition(), nestingMode: 'sequential', stepHeight: 120 }] }],
    };
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(legacy));
    const p = loadSetup()!.orders[0].positions[0];
    expect(p.nestStepSequential).toBe(120);
    expect(p).not.toHaveProperty('stepHeight');
  });

  it('backfills colorIndex by list position for drafts saved before stable colours', () => {
    const draft = {
      vehicle: { id: 'v', name: 'v', length: 1, width: 1, height: 1 },
      orders: [
        { key: 'a', orderId: 'SO-1', positions: [emptyPosition()] },
        { key: 'b', orderId: 'SO-2', positions: [emptyPosition()] },
      ],
    };
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(draft));
    expect(loadSetup()!.orders.map((o) => o.colorIndex)).toEqual([0, 1]);
  });

  it('returns null on a corrupt draft instead of throwing', () => {
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, '{not json');
    expect(loadSetup()).toBeNull();
  });
});
