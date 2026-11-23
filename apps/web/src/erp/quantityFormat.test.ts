import { describe, expect, it } from 'vitest';
import { formatSourceQuantity } from './quantityFormat';

describe('formatSourceQuantity', () => {
  it('formatSourceQuantity: немецкий формат без округления', () => {
    expect(formatSourceQuantity(12.4, 'de')).toBe('12,4');
    expect(formatSourceQuantity(1250.125, 'de')).toBe('1.250,125');
  });

  it('целое — без дробной части, до трёх знаков после запятой', () => {
    expect(formatSourceQuantity(2598, 'de')).toBe('2.598');
    expect(formatSourceQuantity(2597.361, 'de')).toBe('2.597,361');
  });

  it('русская локаль — свой разделитель', () => {
    expect(formatSourceQuantity(12.4, 'ru')).toBe('12,4');
    // ru-RU группирует разряды неразрывным пробелом
    expect(formatSourceQuantity(1250.125, 'ru')).toBe('1 250,125');
  });
});
