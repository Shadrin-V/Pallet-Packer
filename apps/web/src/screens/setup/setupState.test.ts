import { describe, it, expect, beforeEach } from 'vitest';
import {
  SETUP_STORAGE_KEY, emptyOrder, emptyPosition, loadSetup, nextColorIndex, nextOrderNumber, toCargo,
  toCargoList, type PositionState,
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

describe('toCargoList', () => {
  /** Позиция, пригодная к расчёту: `emptyPosition()` приходит без габаритов. */
  const p = (over: Partial<PositionState> = {}): PositionState => ({
    ...emptyPosition(), name: 'EPAL 1', length: 1200, width: 800, height: 144, quantity: 10, ...over,
  });

  it('собирает груз и адрес каждой позиции одним проходом', () => {
    const orders = [
      { ...emptyOrder(1), key: 'o1', orderId: 'SO-1', positions: [p({ id: 'p1' })] },
      { ...emptyOrder(2), key: 'o2', orderId: 'SO-2', positions: [p({ id: 'p2', quantity: 3 })] },
    ];
    const { cargo, addressOf } = toCargoList(orders);
    expect(cargo.map((c) => c.id)).toEqual(['p1', 'p2']);
    expect(cargo.map((c) => c.orderId)).toEqual(['SO-1', 'SO-2']);
    expect(addressOf.get('p2')).toEqual({ orderKey: 'o2', positionId: 'p2' });
  });

  // Обнуление количества — способ временно исключить строку из заявки (спека §6). Пока строка
  // попадала в груз, движок всё равно проверял её габариты, и обнулённый слишком крупный груз
  // МОЛЧА рвал расчёт: ERR_CARGO_EXCEEDS_VEHICLE → пустая раскладка без объяснения.
  it('исключает позиции с нулевым количеством — вместе с их адресом', () => {
    const orders = [{
      ...emptyOrder(1), key: 'o1', orderId: 'SO-1',
      positions: [p({ id: 'p1', quantity: 0 }), p({ id: 'p2' })],
    }];
    const { cargo, addressOf } = toCargoList(orders);
    expect(cargo.map((c) => c.id)).toEqual(['p2']);
    expect(addressOf.has('p1')).toBe(false);
  });

  it('все количества нулевые → груза нет (движок ответит ERR_EMPTY_LOAD)', () => {
    const orders = [{ ...emptyOrder(1), key: 'o1', orderId: 'SO-1', positions: [p({ quantity: 0 })] }];
    expect(toCargoList(orders).cargo).toEqual([]);
  });
});
