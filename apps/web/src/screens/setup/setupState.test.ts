import { describe, it, expect, beforeEach } from 'vitest';
import type { Vehicle } from '@shadrin-v/engine';
import type { OrderPosition, OrderZone } from '@shadrin-v/contracts';
import {
  SETUP_STORAGE_KEY, applySuggestion, emptyOrder, emptyPosition, isPristineDraft, loadSetup, nextColorIndex,
  nextOrderNumber, orderStateFromZone, rulesPatch, toCargo, toCargoList, type PositionState,
} from './setupState';
import { setupMessages } from './setupValidation';

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

  it('keeps a well-formed trip reference and drops a corrupt one', () => {
    const base = {
      vehicle: { id: 'v', name: 'v', length: 1, width: 1, height: 1 },
      orders: [{ key: 'a', orderId: 'SO-1', colorIndex: 0, positions: [emptyPosition()] }],
    };
    const trip = { tripId: 'LKW-2026-00412', loadingDate: '2026-11-24' };
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ ...base, trip }));
    expect(loadSetup()!.trip).toEqual(trip);
    globalThis.localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify({ ...base, trip: { tripId: 7 } }));
    expect(loadSetup()).not.toHaveProperty('trip');
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

describe('isPristineDraft (F2, решение владельца: нетронутая заготовка замещается импортом)', () => {
  it('ровно один заказ с ровно одной нетронутой позицией — нетронутая заготовка', () => {
    expect(isPristineDraft([emptyOrder(1)])).toBe(true);
  });

  it('тронутое имя позиции — уже не заготовка', () => {
    const o = emptyOrder(1);
    o.positions[0].name = 'Palette';
    expect(isPristineDraft([o])).toBe(false);
  });

  it('введённый габарит — уже не заготовка', () => {
    const o = emptyOrder(1);
    o.positions[0].length = 800;
    expect(isPristineDraft([o])).toBe(false);
  });

  it('изменённый orderId — уже не заготовка', () => {
    const o = { ...emptyOrder(1), orderId: 'AB-77' };
    expect(isPristineDraft([o])).toBe(false);
  });

  it('две позиции в заказе — уже не заготовка', () => {
    const o = emptyOrder(1);
    o.positions.push(emptyPosition());
    expect(isPristineDraft([o])).toBe(false);
  });

  it('два заказа — уже не заготовка, даже если оба нетронуты', () => {
    expect(isPristineDraft([emptyOrder(1), emptyOrder(2)])).toBe(false);
  });

  it('пустой список заказов — не заготовка', () => {
    expect(isPristineDraft([])).toBe(false);
  });

  it('тронутое поле правила (не только габариты/имя) — уже не заготовка', () => {
    // Предикат сравнивает ВСЕ поля позиции с emptyPosition() программно, а не по списку — это
    // ловит правило (например, rotation), а не только габариты и имя.
    const o = emptyOrder(1);
    o.positions[0].rotation = 'full';
    expect(isPristineDraft([o])).toBe(false);
  });
});

describe('зона ERP → черновик: правила каталога, неразмещаемое, происхождение габаритов', () => {
  const vehicle: Vehicle = { id: 'v', name: 'LKW', length: 13600, width: 2450, height: 2450 };
  const zone = (p: Partial<OrderPosition>, z: Partial<OrderZone> = {}): OrderZone =>
    ({ orderId: 'PUR-ORD-2026-00871', partner: 'Muster Paletten Sp. z o.o.', ...z,
       positions: [{ itemCode: 'HAN0412', itemName: 'Einwegpalette 1200x800', quantity: 440, dimensionsSource: 'catalog', lineRef: 'a1b2c3d4e5', ...p }] });

  it('orderStateFromZone применяет правила каталога и шаги вложения', () => {
    const o = orderStateFromZone(zone({ length: 1200, width: 800, height: 144, nestStepSequential: 30,
      rules: { state: 'verschachtelt', nestingMode: 'sequential', rotation: 'none', maxTiers: 3 } }), 0);
    expect(o.positions[0]).toMatchObject({ state: 'verschachtelt', nestingMode: 'sequential', rotation: 'none', maxTiers: 3, nestStepSequential: 30, lineRef: 'a1b2c3d4e5', dimsFromCatalog: true });
    expect(o.partner).toBe('Muster Paletten Sp. z o.o.');
  });

  it('без rules — умолчания emptyPosition', () => {
    expect(orderStateFromZone(zone({}), 0).positions[0]).toMatchObject({ state: 'entschachtelt', rotation: 'yawOnly', nestingMode: 'pairwise' });
  });

  it('переносит покупателя прямой поставки', () => {
    expect(orderStateFromZone(zone({}, { customer: 'Musterkunde Logistik GmbH' }), 0).customer).toBe('Musterkunde Logistik GmbH');
  });

  it('количество рейса и точное количество переносятся как есть; единица на размещаемость не влияет', () => {
    const p = orderStateFromZone(zone({ quantity: 2598, sourceQuantity: 2597.361, uom: 'Cubic Meter' }), 0).positions[0];
    expect(p).toMatchObject({ quantity: 2598, sourceQuantity: 2597.361, uom: 'Cubic Meter' });
    expect(p.unplaceable).toBeUndefined();                                  // нет флага сервера — позиция размещаемая
    expect(toCargoList([orderStateFromZone(zone({ quantity: 440, length: 1200, width: 800, height: 144 }), 0)]).cargo[0].quantity).toBe(440);
  });

  it('неполная запись каталога: каталожные размеры есть, недостающие пусты, расчёт ловит пробел', () => {
    const o = orderStateFromZone(zone({ length: 1200, width: 800, dimensionsSource: 'catalog' }), 0);
    expect(o.positions[0]).toMatchObject({ dimsFromCatalog: true, length: 1200, width: 800, height: '' });
    expect(setupMessages([o], vehicle)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'setup.msg.dimsMissing' })]));
  });

  it('неразмещаемая строка: причина, количество 0, габариты пусты, в груз не идёт', () => {
    const o = orderStateFromZone(zone({ quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES' }), 0);
    expect(o.positions[0]).toMatchObject({ unplaceable: 'ERR_LINE_UNIT_NOT_PIECES', quantity: 0, length: '', uom: 'Cubic Meter' });
    const forced = { ...o, positions: [{ ...o.positions[0], quantity: 5, length: 1000, width: 1000, height: 1000 }] };
    expect(toCargoList([forced]).cargo).toHaveLength(0);
  });

  it('неразмещаемая строка с присланными габаритами: габариты не переносятся', () => {
    const p = orderStateFromZone(zone({ quantity: 0, length: 1200, width: 800, height: 144, unplaceable: 'ERR_LINE_QTY_UNKNOWN' }), 0).positions[0];
    expect([p.length, p.width, p.height, p.quantity]).toEqual(['', '', '', 0]);
  });

  it('размер из названия — предложение, высота пуста', () => {
    expect(orderStateFromZone(zone({ length: 1200, width: 800, dimensionsSource: 'name' }), 0).positions[0])
      .toMatchObject({ dimsFromName: true, length: 1200, width: 800, height: '' });
  });

  it('строка без ERP-дополнений не получает лишних полей', () => {
    const p = orderStateFromZone({ orderId: 'SO-1', positions: [{ itemCode: 'A', itemName: 'A', quantity: 1, dimensionsSource: 'erpnext-field' }] }, 0).positions[0];
    for (const k of ['lineRef', 'uom', 'unplaceable', 'sourceQuantity', 'dimsFromName', 'dimsFromCatalog'])
      expect(p).not.toHaveProperty(k);
  });
});

describe('rulesPatch и applySuggestion', () => {
  it('rulesPatch переносит заданные правила и шаги, отсутствующие шаги — пустые', () => {
    expect(rulesPatch({ rotation: 'full', maxNested: 4 }, { nestStepPairwise: 22 })).toEqual({
      rotation: 'full', maxNested: 4, nestStepPairwise: 22, nestStepSequential: '',
    });
    expect(rulesPatch(undefined, {})).toEqual({ nestStepPairwise: '', nestStepSequential: '' });
  });

  it('applySuggestion снимает пометки происхождения габаритов', () => {
    const patch = applySuggestion({ itemCode: 'A', name: 'A', length: 800, erpFields: [], origin: 'local' });
    expect(patch).toHaveProperty('dimsFromName', undefined);
    expect(patch).toHaveProperty('dimsFromCatalog', undefined);
  });
});
