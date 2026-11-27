import { describe, expect, it } from 'vitest';
import { calculateLayout, type CargoType, type Layout, type Load } from '@shadrin-v/engine';
import { t, type TranslationKey } from '@shadrin-v/i18n';
import type { PlanContext } from './planContext';
import { erpExportParts, notInTruckRows } from './erpPlanExport';

const tt = (k: TranslationKey) => t(k, 'de');
const cube = (id: string, quantity: number, orderId: string, name: string): CargoType => ({
  id,
  name,
  length: 1000,
  width: 1000,
  height: 1000,
  quantity,
  rotation: 'none',
  stacking: { stackable: true },
  nesting: { nestable: false },
  state: 'entschachtelt',
  orderId,
});
const V = { id: 'v', name: 'LKW Standard', length: 2000, width: 2000, height: 2000 };
/** 2 заказа, 3 позиции; у «Gamma» 2 куба не влезают (одной стопкой из 2). */
const load: Load = {
  vehicle: V,
  cargo: [cube('a', 2, 'BE-1', 'Alpha'), cube('b', 2, 'BE-1', 'Beta'), cube('c', 6, 'BE-2', 'Gamma')],
};
const layout = calculateLayout(load);
const m3: PlanContext['unplaceable'][number] = {
  positionId: 'pos-m3',
  orderId: 'BE-2',
  itemCode: 'SCH205',
  itemName: 'Bretter',
  uom: 'Cubic Meter',
  sourceQuantity: 12.4,
  reason: 'ERR_LINE_UNIT_NOT_PIECES',
};
const context: PlanContext = {
  orders: { 'BE-1': { partner: 'Beispiel Paletten SIA' }, 'BE-2': { partner: 'Probe Tara TOV', customer: 'AB-41990' } },
  items: { a: { itemCode: 'EUR101' }, b: {}, c: { itemCode: 'DIS101' } },
  positionOrder: ['a', 'b', 'c', 'pos-m3'],
  unplaceable: [m3],
};

describe('notInTruckRows', () => {
  it('неразмещённое по текущей раскладке и неразмещаемое из контекста — точные строки, без шаблонов', () => {
    const rows = notInTruckRows({ load, layout, context, tt, locale: 'de' });
    expect(rows).toEqual([
      {
        positionId: 'c',
        cargoTypeId: 'c',
        amount: '2 Stk',
        item: 'DIS101 Gamma',
        stacks: '1 Stapel zu 2',
        order: 'BE-2 · Probe Tara TOV · direkt an AB-41990',
        reason: 'kein Platz',
        kind: 'noRoom',
      },
      {
        positionId: 'pos-m3',
        amount: '12,4 m³',
        item: 'SCH205 Bretter',
        order: 'BE-2 · Probe Tara TOV · direkt an AB-41990',
        reason: 'in m³: nicht planbar',
        kind: 'unplaceable',
      },
    ]);
  });

  it('м³ без sourceQuantity — без количества, причина есть', () => {
    const { sourceQuantity: _q, ...noQty } = m3;
    const rows = notInTruckRows({ load, layout, context: { ...context, unplaceable: [noQty] }, tt, locale: 'de' });
    expect(rows[1]).not.toHaveProperty('amount');
    expect(rows[1].reason).toBe('in m³: nicht planbar');
  });

  it('стопки разной высоты — без «Stapel zu»', () => {
    // 10 кубов при 8 местах и ручной правке: в «Lager» стопка из 2 и стопка из 1
    const one: Load = { vehicle: V, cargo: [cube('x', 3, 'BE-1', 'X')] };
    const edited: Layout = { ...calculateLayout(one), placements: [], unplaced: [{ cargoTypeId: 'x', count: 3 }] };
    const [row] = notInTruckRows({ load: one, layout: edited, tt, locale: 'de' });
    expect(row.amount).toBe('3 Stk');
    expect(row).not.toHaveProperty('stacks');
    expect(row.order).toBe('BE-1');
  });

  it('знак позиции, если передан, идёт с каждой строкой', () => {
    const marks = new Map([['c', 'C'], ['pos-m3', 'D']]);
    expect(notInTruckRows({ load, layout, context, marks, tt, locale: 'de' }).map((r) => r.mark)).toEqual(['C', 'D']);
  });
});

describe('erpExportParts', () => {
  it('легенда — по строке на позицию; заметки — «Nicht im LKW» и вес', () => {
    const parts = erpExportParts({ load, layout, context, tt, locale: 'de' });
    expect(parts.legend.map((l) => l.label)).toEqual([
      'BE-1 — EUR101 Alpha ×2',
      'BE-1 — Beta ×2',
      'BE-2 — DIS101 Gamma ×4 (2 nicht im LKW)',
    ]);
    expect(parts.legend.map((l) => l.color)).toEqual(['var(--s1)', 'var(--s1)', 'var(--s2)']);
    expect(parts.notes).toEqual([
      {
        title: 'Nicht im LKW',
        lines: [
          '2 Stk DIS101 Gamma · 1 Stapel zu 2 · BE-2 · Probe Tara TOV · direkt an AB-41990 · kein Platz',
          '12,4 m³ SCH205 Bretter · BE-2 · Probe Tara TOV · direkt an AB-41990 · in m³: nicht planbar',
        ],
      },
      {
        title: 'Gewicht wird nicht geprüft',
        lines: ['Der Ladungsplaner rechnet nur mit Maßen. Zulässiges Gesamtgewicht und Achslasten prüfst du selbst.'],
      },
    ]);
  });

  it('стабильные цвета заказов из карты Setup', () => {
    const parts = erpExportParts({ load, layout, context, orderColors: new Map([['BE-1', 4], ['BE-2', 0]]), tt, locale: 'de' });
    expect(parts.legend.map((l) => l.color)).toEqual(['var(--s5)', 'var(--s5)', 'var(--s1)']);
  });

  it('всё поместилось — блока «Nicht im LKW» нет, заметка о весе остаётся', () => {
    const small: Load = { vehicle: V, cargo: [cube('a', 2, 'BE-1', 'Alpha')] };
    const parts = erpExportParts({ load: small, layout: calculateLayout(small), tt, locale: 'de' });
    expect(parts.notes.map((n) => n.title)).toEqual(['Gewicht wird nicht geprüft']);
  });

  it('со знаками — знак первым в строках легенды и «Nicht im LKW»', () => {
    const marks = new Map([['a', 'A'], ['b', 'B'], ['c', 'C'], ['pos-m3', 'D']]);
    const parts = erpExportParts({ load, layout, context, marks, tt, locale: 'de' });
    expect(parts.legend.map((l) => l.label.split(' ')[0])).toEqual(['A', 'B', 'C']);
    expect(parts.notes[0].lines.map((l) => l.split(' ')[0])).toEqual(['C', 'D']);
  });

  it('русская локаль: числа и подписи по-русски', () => {
    const parts = erpExportParts({ load, layout, context, tt: (k) => t(k, 'ru'), locale: 'ru' });
    expect(parts.notes[0].title).toBe('Не в LKW');
    expect(parts.notes[0].lines[1]).toContain('12,4 м³');
  });
});
