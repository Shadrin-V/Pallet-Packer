import { describe, it, expect, beforeEach } from 'vitest';
import {
  SETUP_STORAGE_KEY, emptyOrder, emptyPosition, loadSetup, nextColorIndex, nextOrderNumber,
  orderStateFromZone, toCargo, toCargoList, type PositionState,
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

describe('orderStateFromZone (s17)', () => {
  const zone = {
    orderId: 'SO-1234',
    positions: [
      {
        itemCode: 'ABB101',
        itemName: 'Einwegpalette',
        quantity: 12,
        length: 800,
        width: 600,
        height: 144,
        dimensionsSource: 'erpnext-field' as const,
      },
      {
        itemCode: 'X-9',
        itemName: 'Sonderteil',
        quantity: 3,
        dimensionsSource: 'manual' as const,
      },
    ],
  };

  it('переносит номер заказа, слот палитры и все позиции', () => {
    const o = orderStateFromZone(zone, 2);

    expect(o.orderId).toBe('SO-1234');
    expect(o.colorIndex).toBe(2);
    expect(o.positions).toHaveLength(2);
    expect(o.key).toBeTruthy();
  });

  it('переносит имя, количество и код артикула позиции', () => {
    const [p] = orderStateFromZone(zone, 0).positions;

    expect(p.name).toBe('Einwegpalette');
    expect(p.quantity).toBe(12);
    expect(p.articleCode).toBe('ABB101');
  });

  it('габариты из ERPNext переносятся числами', () => {
    const [p] = orderStateFromZone(zone, 0).positions;

    expect([p.length, p.width, p.height]).toEqual([800, 600, 144]);
  });

  it('позиция без габаритов даёт пустые поля, а не нули', () => {
    // Пустое поле — это «нужен ручной ввод»: setupValidation даёт по такой строке ошибку
    // «укажите размеры» с адресом. Ноль был бы ЗАПОЛНЕННЫМ неверным размером и прошёл бы мимо неё.
    const p = orderStateFromZone(zone, 0).positions[1];

    expect([p.length, p.width, p.height]).toEqual(['', '', '']);
  });

  it('правила остаются умолчаниями, поля не лочатся', () => {
    // locked описывает провенанс полей АРТИКУЛА из каталога (ADR 022), а не строку Sales Order:
    // залочить — значит лишить логиста возможности поправить размер, неверно заполненный в ERPNext.
    const [p] = orderStateFromZone(zone, 0).positions;
    const d = emptyPosition();

    expect(p.locked).toBeUndefined();
    expect(p.rotation).toBe(d.rotation);
    expect(p.state).toBe(d.state);
    expect(p.nestingMode).toBe(d.nestingMode);
  });

  it('у позиций разные id — иначе строки склеятся в адресации сообщений', () => {
    const [a, b] = orderStateFromZone(zone, 0).positions;

    expect(a.id).not.toBe(b.id);
  });

  it('заказ без позиций даёт пустую карточку, а не падение', () => {
    expect(orderStateFromZone({ orderId: 'SO-0', positions: [] }, 0).positions).toEqual([]);
  });
});
