import { describe, it, expect } from 'vitest';
import { formatUom, uomKey } from './uomLabel';

describe('uomLabel', () => {
  it('единицы ERP показываются коротко, неизвестные — как есть', () => {
    const tt = (k: string) => ({ 'uom.pieces': 'Stk', 'uom.cubicMeter': 'm³' })[k] ?? k;
    expect(formatUom('Cubic Meter', tt as never)).toBe('m³');
    expect(formatUom('Nos', tt as never)).toBe('Stk');
    expect(formatUom('Kilogram', tt as never)).toBe('Kilogram');
  });

  it('ключи известных единиц', () => {
    expect(uomKey('Nos')).toBe('uom.pieces');
    expect(uomKey('Stk')).toBe('uom.pieces');
    expect(uomKey('Cubic Meter')).toBe('uom.cubicMeter');
    expect(uomKey('Meter')).toBeUndefined();
  });

  it('нет единицы — пустая строка', () => {
    const tt = (k: string) => k;
    expect(formatUom(undefined, tt as never)).toBe('');
    expect(formatUom('', tt as never)).toBe('');
  });
});
