import { describe, expect, it } from 'vitest';
import { formatSourceQuantity } from './quantityFormat';

describe('formatSourceQuantity', () => {
  it('formatSourceQuantity: немецкий формат без округления', () => {
    expect(formatSourceQuantity(12.4, 'de')).toBe('12,4');
    expect(formatSourceQuantity(1250.125, 'de')).toBe('1.250,125');
  });

  it('целое — без дробной части; три знака после запятой — как есть', () => {
    expect(formatSourceQuantity(2598, 'de')).toBe('2.598');
    expect(formatSourceQuantity(2597.361, 'de')).toBe('2.597,361');
  });

  it('русская локаль — свой разделитель', () => {
    expect(formatSourceQuantity(12.4, 'ru')).toBe('12,4');
    // ru-RU группирует разряды неразрывным пробелом
    expect(formatSourceQuantity(1250.125, 'ru')).toBe('1 250,125');
  });

  it('точное количество с пятью-шестью знаками — без округления, лишние нули не показываются', () => {
    expect(formatSourceQuantity(12.34567, 'de')).toBe('12,34567');
    expect(formatSourceQuantity(12.34567, 'ru')).toBe('12,34567');
    expect(formatSourceQuantity(0.123456, 'de')).toBe('0,123456');
    expect(formatSourceQuantity(12.5, 'de')).toBe('12,5');
  });

  it('девять знаков после запятой (точность числовых полей Frappe) — без округления; погрешность за девятым знаком не видна', () => {
    expect(formatSourceQuantity(12.123456789, 'de')).toBe('12,123456789');
    expect(formatSourceQuantity(12.123456789, 'ru')).toBe('12,123456789');
    expect(formatSourceQuantity(0.000000001, 'de')).toBe('0,000000001');
    expect(formatSourceQuantity(0.1 + 0.2, 'de')).toBe('0,3');
    expect(formatSourceQuantity(1.1 + 2.2, 'ru')).toBe('3,3');
  });
});
