import { describe, it, expect } from 'vitest';
import { formatLength } from './format';

// Intl.NumberFormat('ru-RU') groups thousands with U+00A0 NO-BREAK SPACE, not a plain space.
// Built via fromCharCode (not a literal/escaped character) so the separator is unambiguous and
// impossible to silently corrupt in source control.
const NBSP = String.fromCharCode(0xa0);

describe('formatLength', () => {
  it('formats a German length with dot grouping and the "mm" unit', () => {
    expect(formatLength(13600, 'de')).toBe('13.600 mm');
  });

  it('formats a Russian length with non-breaking-space grouping and the "мм" unit', () => {
    expect(formatLength(13600, 'ru')).toBe(`13${NBSP}600 мм`);
  });

  it('formats values below the grouping threshold without a separator', () => {
    expect(formatLength(650, 'de')).toBe('650 mm');
    expect(formatLength(650, 'ru')).toBe('650 мм');
  });

  it('formats zero', () => {
    expect(formatLength(0, 'de')).toBe('0 mm');
    expect(formatLength(0, 'ru')).toBe('0 мм');
  });

  it('formats a typical EPAL pallet height', () => {
    expect(formatLength(2650, 'de')).toBe('2.650 mm');
    expect(formatLength(2650, 'ru')).toBe(`2${NBSP}650 мм`);
  });
});
