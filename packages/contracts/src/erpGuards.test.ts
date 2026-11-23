import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { OrderZone } from './dto';
import {
  isOpenLine,
  isOrderZone,
  isTripImport,
  isUnplaceableReason,
  normalizeOrderZone,
  parseErpSession,
} from './erpGuards';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/erp-v1');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readFixture = (name: string): any => JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));

describe('ERP v1 response guards', () => {
  it('образец рейса из контракта проходит проверку', () => {
    const trip = readFixture('reise-LKW-2026-00412.json').message;
    expect(isTripImport(trip)).toBe(true);
    expect(trip.zones[0].positions[1].unplaceable).toBe('ERR_LINE_UNIT_NOT_PIECES');
    expect(trip.zones[0].positions[1].sourceQuantity).toBe(12.4);
  });

  it('образец ошибки несёт код', () => {
    expect(readFixture('fehler-ERR_FORBIDDEN.json').message).toEqual({
      code: 'ERR_FORBIDDEN',
      details: { doctype: 'Purchase Order' },
    });
  });

  it('isUnplaceableReason узнаёт только коды контракта', () => {
    expect(isUnplaceableReason('ERR_LINE_NO_ITEM')).toBe(true);
    expect(isUnplaceableReason('ERR_X')).toBe(false);
    expect(isUnplaceableReason(undefined)).toBe(false);
  });

  it('отвергает дробное количество, нулевую длину, чужой источник и чужую причину', () => {
    const ok = { orderId: 'PUR-ORD-1', positions: [{ itemCode: 'A', itemName: 'A', quantity: 1, dimensionsSource: 'manual' }] };
    const pos = (p: object) => ({ ...ok, positions: [{ ...ok.positions[0], ...p }] });
    expect(isOrderZone(ok)).toBe(true);
    expect(isOrderZone(pos({ quantity: 1.5 }))).toBe(false);
    expect(isOrderZone(pos({ length: 0 }))).toBe(false);
    expect(isOrderZone(pos({ dimensionsSource: 'guess' }))).toBe(false);
    expect(isOrderZone(pos({ unplaceable: 'ERR_X' }))).toBe(false);
  });

  it('sourceQuantity: дробное у неразмещаемой и у размещаемой — да; отрицательное или строкой — нет', () => {
    const ok = { orderId: 'PUR-ORD-1', positions: [{ itemCode: 'A', itemName: 'A', quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES' }] };
    const pos = (p: object) => ({ ...ok, positions: [{ ...ok.positions[0], ...p }] });
    expect(isOrderZone(pos({ sourceQuantity: 12.4 }))).toBe(true);
    expect(isOrderZone(ok)).toBe(true);
    expect(isOrderZone(pos({ sourceQuantity: -1 }))).toBe(false);
    expect(isOrderZone(pos({ sourceQuantity: '12.4' }))).toBe(false);
    expect(isOrderZone(pos({ sourceQuantity: 2597.361, unplaceable: undefined, quantity: 2598, uom: 'Nos' }))).toBe(true);
    expect(isOrderZone(pos({ sourceQuantity: null }))).toBe(true);
  });

  it('normalizeOrderZone: null у sourceQuantity превращается в отсутствие ключа, число не трогается', () => {
    const z = { orderId: 'PUR-ORD-1', positions: [
      { itemCode: 'A', itemName: 'A', quantity: 0, uom: 'Cubic Meter', dimensionsSource: 'manual', unplaceable: 'ERR_LINE_UNIT_NOT_PIECES', sourceQuantity: null },
      { itemCode: 'B', itemName: 'B', quantity: 2598, uom: 'Nos', dimensionsSource: 'manual', sourceQuantity: 2597.361 } ] } as unknown as OrderZone;
    const n = normalizeOrderZone(z);
    expect('sourceQuantity' in n.positions[0]).toBe(false);
    expect(n.positions[1].sourceQuantity).toBe(2597.361);
  });

  it('сессия: чужой язык → de, без csrfToken → null', () => {
    const s = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'en', csrfToken: 't', appVersion: '0.21.567' };
    expect(parseErpSession(s)?.language).toBe('de');
    expect(parseErpSession({ ...s, language: 'ru' })?.language).toBe('ru');
    const { csrfToken: _drop, ...noToken } = s;
    expect(parseErpSession(noToken)).toBeNull();
  });

  it('сессия: пустой user или пустой csrfToken → null', () => {
    const s = { user: 'anna@firma.de', fullName: 'Anna Muster', language: 'de', csrfToken: 't', appVersion: '0.21.567' };
    expect(parseErpSession(s)).not.toBeNull();
    expect(parseErpSession({ ...s, user: '' })).toBeNull();
    expect(parseErpSession({ ...s, csrfToken: '' })).toBeNull();
  });

  it('строка закупки: reason ⇔ placeable false', () => {
    const l = { lineRef: 'x', orderId: 'PUR-ORD-1', itemCode: 'A', itemName: 'A', openQuantity: 2.5, uom: 'Cubic Meter', placeable: true };
    expect(isOpenLine(l)).toBe(true);
    expect(isOpenLine({ ...l, placeable: false })).toBe(false);
    expect(isOpenLine({ ...l, reason: 'ERR_LINE_NO_ITEM' })).toBe(false);
    expect(isOpenLine({ ...l, openQuantity: null, placeable: false, reason: 'ERR_LINE_QTY_UNKNOWN' })).toBe(true);
  });
});
