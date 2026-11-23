import { describe, it, expect } from 'vitest';
import type { OrderPosition, OrderZone } from '@shadrin-v/contracts';
import { emptyOrder, orderStateFromZone } from '../screens/setup/setupState';
import { draftTrip, isPlanContext, planContextFrom } from './planContext';
import { mergeZonesIntoDraft } from './zoneDraft';

const zone = (p: Partial<OrderPosition>, z: Partial<OrderZone> = {}): OrderZone =>
  ({ orderId: 'PUR-ORD-2026-00871', partner: 'Muster Paletten Sp. z o.o.', ...z,
     positions: [{ itemCode: 'HAN0412', itemName: 'Einwegpalette 1200x800', quantity: 440, dimensionsSource: 'catalog', lineRef: 'a1b2c3d4e5', ...p }] });

describe('planContextFrom', () => {
  it('контекст плана: заказы, коды артикулов по id позиции, неразмещаемое, рейс', () => {
    const orders = [orderStateFromZone(zone({}, { customer: 'Musterkunde Logistik GmbH' }), 0),
                    orderStateFromZone(zone({ lineRef: 'm3', itemCode: 'SCH205', itemName: 'Bretter', quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES' }, { orderId: 'PUR-ORD-3' }), 1)];
    const fromTrip = orders.map((o) => ({ ...o, positions: o.positions.map((p) => ({ ...p, fromTrip: 'LKW-2026-00412' })) }));
    const ctx = planContextFrom(fromTrip, { tripId: 'LKW-2026-00412', loadingDate: '2026-11-24' });
    expect(ctx.trip).toEqual({ tripId: 'LKW-2026-00412', loadingDate: '2026-11-24' });
    expect(ctx.orders['PUR-ORD-2026-00871']).toEqual({ partner: 'Muster Paletten Sp. z o.o.', customer: 'Musterkunde Logistik GmbH' });
    expect(ctx.items[orders[0].positions[0].id]).toEqual({ itemCode: 'HAN0412' });
    expect(ctx.unplaceable).toEqual([{ positionId: orders[1].positions[0].id, orderId: 'PUR-ORD-3', itemCode: 'SCH205', itemName: 'Bretter', uom: 'Cubic Meter', reason: 'ERR_LINE_UNIT_NOT_PIECES' }]);
    expect(ctx.positionOrder).toEqual([orders[0].positions[0].id, orders[1].positions[0].id]);   // размещаемые и неразмещаемые вместе, в порядке показа
    expect(isPlanContext(JSON.parse(JSON.stringify(ctx)))).toBe(true);
    expect(isPlanContext({ orders: 1 })).toBe(false);
  });

  it('точное количество неразмещаемой строки идёт в контекст как есть', () => {
    const o = orderStateFromZone(zone({ quantity: 0, sourceQuantity: 12.5, uom: 'Cubic Meter', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES' }), 0);
    expect(planContextFrom([o]).unplaceable[0].sourceQuantity).toBe(12.5);
  });

  it('обычная сборка: без рейса, заказы без поставщика, свободные строки без кода', () => {
    const ctx = planContextFrom([emptyOrder(1)]);
    expect(ctx).not.toHaveProperty('trip');
    expect(ctx.orders).toEqual({ 'SO-1': {} });
    expect(Object.values(ctx.items)).toEqual([{}]);
    expect(ctx.unplaceable).toEqual([]);
    expect(isPlanContext(ctx)).toBe(true);
  });
});

describe('draftTrip — номер рейса только у плана из одного рейса', () => {
  const A = { tripId: 'LKW-A', loadingDate: '2026-11-24' };
  const B = { tripId: 'LKW-B' };
  const loadA = () => mergeZonesIntoDraft([emptyOrder(1)], [zone({ lineRef: 'a1' }), zone({ lineRef: 'a2' }, { orderId: 'PUR-ORD-2' })], A.tripId).orders;

  it('только рейс: номер есть — и в контексте плана', () => {
    expect(draftTrip(loadA(), A)).toEqual(A);
    expect(planContextFrom(loadA(), A).trip).toEqual(A);
  });

  it('рейс A, затем рейс B: план — своя подборка, номера нет нигде', () => {
    const ab = mergeZonesIntoDraft(loadA(), [zone({ lineRef: 'b1' }, { orderId: 'PUR-ORD-9' })], B.tripId).orders;
    expect(draftTrip(ab, B)).toBeUndefined();
    expect(planContextFrom(ab, B)).not.toHaveProperty('trip');
  });

  it('рейс и отдельные строки: номера нет', () => {
    const withLines = mergeZonesIntoDraft(loadA(), [zone({ lineRef: 'l1' })]).orders;
    expect(draftTrip(withLines, A)).toBeUndefined();
    expect(planContextFrom(withLines, A)).not.toHaveProperty('trip');
  });

  it('черновик старого вида (позиции без происхождения) и пустой черновик — номера нет', () => {
    const legacy = [orderStateFromZone(zone({}), 0)];
    expect(draftTrip(legacy, A)).toBeUndefined();
    expect(draftTrip([emptyOrder(1)], A)).toBeUndefined();
    expect(draftTrip(loadA(), undefined)).toBeUndefined();
  });

  it('позиции, убранные после рейса B, возвращают номер B, если остались только его', () => {
    const ab = mergeZonesIntoDraft(loadA(), [zone({ lineRef: 'b1' }, { orderId: 'PUR-ORD-9' })], B.tripId).orders;
    const onlyB = ab.filter((o) => o.orderId === 'PUR-ORD-9');
    expect(draftTrip(onlyB, B)).toEqual(B);
  });
});

describe('isPlanContext', () => {
  const ok = () => planContextFrom([orderStateFromZone(zone({ quantity: 0, uom: 'Cubic Meter', unplaceable: 'ERR_LINE_NO_ITEM' }), 0)], { tripId: 'T' });

  it.each([
    ['null', null],
    ['не объект', 'x'],
    ['рейс без tripId', { ...ok(), trip: { loadingDate: '2026-11-24' } }],
    ['дата рейса не строка', { ...ok(), trip: { tripId: 'T', loadingDate: 5 } }],
    ['заказ не объект', { ...ok(), orders: { A: 'x' } }],
    ['поставщик не строка', { ...ok(), orders: { A: { partner: 1 } } }],
    ['код артикула не строка', { ...ok(), items: { p: { itemCode: 1 } } }],
    ['порядок не массив строк', { ...ok(), positionOrder: [1] }],
    ['неразмещаемое не массив', { ...ok(), unplaceable: {} }],
    ['неизвестная причина', { ...ok(), unplaceable: [{ ...ok().unplaceable[0], reason: 'ERR_X' }] }],
    ['без имени строки', { ...ok(), unplaceable: [{ ...ok().unplaceable[0], itemName: undefined }] }],
    ['количество не число', { ...ok(), unplaceable: [{ ...ok().unplaceable[0], sourceQuantity: '1' }] }],
  ])('отвергает: %s', (_label, x) => {
    expect(isPlanContext(x)).toBe(false);
  });
});
