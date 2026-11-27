import { describe, it, expect } from 'vitest';
import type { OrderPosition, OrderZone } from '@shadrin-v/contracts';
import { emptyOrder, orderStateFromZone } from '../screens/setup/setupState';
import { draftLineRefs, mergeZonesIntoDraft } from './zoneDraft';

const zone = (p: Partial<OrderPosition>, z: Partial<OrderZone> = {}): OrderZone =>
  ({ orderId: 'PUR-ORD-2026-00871', partner: 'Muster Paletten Sp. z o.o.', ...z,
     positions: [{ itemCode: 'HAN0412', itemName: 'Einwegpalette 1200x800', quantity: 440, dimensionsSource: 'catalog', lineRef: 'a1b2c3d4e5', ...p }] });

describe('mergeZonesIntoDraft', () => {
  it('mergeZonesIntoDraft: заготовка замещается, дубль строки пропускается, тот же заказ дописывается, порядок сохраняется', () => {
    const first = mergeZonesIntoDraft([emptyOrder(1)], [zone({})]);
    expect(first.orders).toHaveLength(1);
    expect(first.orders[0].orderId).toBe('PUR-ORD-2026-00871');
    const again = mergeZonesIntoDraft(first.orders, [zone({}), zone({ lineRef: 'zz' }), zone({ lineRef: 'yy' }, { orderId: 'PUR-ORD-2' })]);
    expect(again.skippedLineRefs).toEqual(['a1b2c3d4e5']);
    expect(again.orders.map((o) => o.orderId)).toEqual(['PUR-ORD-2026-00871', 'PUR-ORD-2']);
    expect(again.orders[0].positions.map((p) => p.lineRef)).toEqual(['a1b2c3d4e5', 'zz']);
    expect(new Set(again.orders.map((o) => o.colorIndex)).size).toBe(2);
    expect(again.addedPositions).toBe(2);
  });

  it('заготовка отдаёт свой слот палитры первой новой карточке', () => {
    const pristine = emptyOrder(1, 5);
    const r = mergeZonesIntoDraft([pristine], [zone({}), zone({ lineRef: 'b' }, { orderId: 'PUR-ORD-2' })]);
    expect(r.orders.map((o) => o.colorIndex)).toEqual([5, 0]);
  });

  it('реальный черновик дополняется, а не замещается', () => {
    const own = { ...emptyOrder(1), orderId: 'SO-77' };
    const r = mergeZonesIntoDraft([own], [zone({})]);
    expect(r.orders.map((o) => o.orderId)).toEqual(['SO-77', 'PUR-ORD-2026-00871']);
    expect(r.orders[0]).toBe(own);
  });

  it('заказ совпадает по orderId после trim', () => {
    const draft = [orderStateFromZone(zone({}, { orderId: ' PUR-ORD-9 ' }), 0)];
    const r = mergeZonesIntoDraft(draft, [zone({ lineRef: 'n2' }, { orderId: 'PUR-ORD-9' })]);
    expect(r.orders).toHaveLength(1);
    expect(r.orders[0].positions.map((p) => p.lineRef)).toEqual(['a1b2c3d4e5', 'n2']);
  });

  it('зона без оставшихся позиций ничего не добавляет; заготовка остаётся, если добавить нечего', () => {
    const draft = [orderStateFromZone(zone({}), 0)];
    const r = mergeZonesIntoDraft(draft, [zone({}, { orderId: 'PUR-ORD-NEW' }), { orderId: 'PUR-ORD-EMPTY', positions: [] }]);
    expect(r.orders).toBe(draft);
    expect(r.addedPositions).toBe(0);
    expect(r.skippedLineRefs).toEqual(['a1b2c3d4e5']);
    const pristine = [emptyOrder(1)];
    expect(mergeZonesIntoDraft(pristine, [{ orderId: 'X', positions: [] }]).orders).toBe(pristine);
  });

  it('повтор строки внутри одного ответа тоже пропускается', () => {
    const r = mergeZonesIntoDraft([emptyOrder(1)], [zone({}), zone({})]);
    expect(r.addedPositions).toBe(1);
    expect(r.skippedLineRefs).toEqual(['a1b2c3d4e5']);
  });

  it('строки без lineRef никогда не пропускаются', () => {
    const r = mergeZonesIntoDraft([emptyOrder(1)], [zone({ lineRef: undefined }), zone({ lineRef: undefined })]);
    expect(r.addedPositions).toBe(2);
    expect(r.orders[0].positions).toHaveLength(2);
  });

  it('новая карточка дописанного заказа перенимает поставщика и покупателя, если их не было', () => {
    const draft = [{ ...emptyOrder(1), orderId: 'PUR-ORD-2026-00871', positions: [] }];
    const r = mergeZonesIntoDraft(draft, [zone({}, { customer: 'Musterkunde Logistik GmbH' })]);
    expect(r.orders[0]).toMatchObject({ partner: 'Muster Paletten Sp. z o.o.', customer: 'Musterkunde Logistik GmbH' });
  });
});

describe('mergeZonesIntoDraft — происхождение позиций', () => {
  it('позиции рейса помечены его номером, строки из списка — без пометки; прежние позиции не трогаются', () => {
    const fromA = mergeZonesIntoDraft([emptyOrder(1)], [zone({ lineRef: 'a' })], 'LKW-A');
    expect(fromA.orders[0].positions.map((p) => p.fromTrip)).toEqual(['LKW-A']);
    const plusLines = mergeZonesIntoDraft(fromA.orders, [zone({ lineRef: 'l' }), zone({ lineRef: 'm' }, { orderId: 'PUR-ORD-2' })]);
    expect(plusLines.orders.flatMap((o) => o.positions).map((p) => p.fromTrip)).toEqual(['LKW-A', undefined, undefined]);
    expect(plusLines.orders[1].positions[0]).not.toHaveProperty('fromTrip');
    const plusB = mergeZonesIntoDraft(fromA.orders, [zone({ lineRef: 'b' })], 'LKW-B');
    expect(plusB.orders[0].positions.map((p) => p.fromTrip)).toEqual(['LKW-A', 'LKW-B']);
  });
});

describe('draftLineRefs', () => {
  it('собирает lineRef всех позиций черновика', () => {
    const orders = [orderStateFromZone(zone({}), 0), orderStateFromZone(zone({ lineRef: 'q' }, { orderId: 'B' }), 1), emptyOrder(3)];
    expect(draftLineRefs(orders)).toEqual(new Set(['a1b2c3d4e5', 'q']));
  });
});
