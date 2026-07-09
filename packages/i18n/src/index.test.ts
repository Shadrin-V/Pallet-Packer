import { describe, it, expect } from 'vitest';
import * as i18n from './index';

describe('@shadrin-v/i18n bootstrap', () => {
  it('declares the supported MVP locales de and ru', () => {
    expect((i18n as Record<string, unknown>).SUPPORTED_LOCALES).toEqual(['de', 'ru']);
  });
});
