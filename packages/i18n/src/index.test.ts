import { describe, it, expect } from 'vitest';
import * as i18n from './index';

describe('@shadrin-v/i18n bootstrap', () => {
  it('declares the supported MVP locales de and ru', () => {
    expect((i18n as Record<string, unknown>).SUPPORTED_LOCALES).toEqual(['de', 'ru']);
  });

  it('exposes the canonical translation key list', () => {
    expect(Array.isArray(i18n.TRANSLATION_KEYS)).toBe(true);
    expect(i18n.TRANSLATION_KEYS).toContain('action.calculate');
    expect(i18n.TRANSLATION_KEYS).toContain('ERR_EMPTY_LOAD');
  });

  it('exposes t() and formatLength() as functions', () => {
    expect(typeof i18n.t).toBe('function');
    expect(typeof i18n.formatLength).toBe('function');
  });

  it('t() and formatLength() work end-to-end through the public barrel', () => {
    expect(i18n.t('action.calculate', 'de')).toBe('Berechnen');
    expect(i18n.formatLength(2650, 'de')).toBe('2.650 mm');
  });
});
