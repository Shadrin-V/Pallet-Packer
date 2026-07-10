import { describe, it, expect } from 'vitest';
import { TRANSLATION_KEYS } from './keys';
import { t } from './translate';

describe('t (translation lookup)', () => {
  it('resolves a UI key to German text', () => {
    expect(t('action.calculate', 'de')).toBe('Berechnen');
  });

  it('resolves the same UI key to Russian text', () => {
    expect(t('action.calculate', 'ru')).toBe('Рассчитать');
  });

  it('resolves an engine error code to locale-specific text', () => {
    expect(t('ERR_EMPTY_LOAD', 'de')).toBe('Die Ladeliste ist leer.');
    expect(t('ERR_EMPTY_LOAD', 'ru')).toBe('Список груза пуст.');
  });

  it('resolves every declared translation key without throwing, in every locale', () => {
    for (const locale of ['de', 'ru'] as const) {
      for (const key of TRANSLATION_KEYS) {
        expect(() => t(key, locale)).not.toThrow();
        expect(typeof t(key, locale)).toBe('string');
      }
    }
  });
});
