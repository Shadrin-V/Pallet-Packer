import { beforeEach, describe, expect, it } from 'vitest';
import { readTheme, applyTheme, THEME_STORAGE_KEY } from './useTheme';

describe('хранение темы', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('умолчание — forest', () => {
    expect(readTheme()).toBe('forest');
  });

  it('мусор в хранилище не ломает приложение', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'chartreuse');
    expect(readTheme()).toBe('forest');
  });

  it('сохранённая тема переживает перезагрузку', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'warm');
    expect(readTheme()).toBe('warm');
  });

  it('forest не оставляет атрибут на html — это умолчание каскада', () => {
    applyTheme('forest');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('warm ставит атрибут', () => {
    applyTheme('warm');
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
  });
});
