import { beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('палитра хоста (сборка для ERP)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.resetModules();
  });

  it('палитра хоста запирается: applyTheme её не снимает и не пишет выбор', async () => {
    const m = await import('./useTheme');
    m.applyHostPalette('schaefer');
    m.applyTheme('warm');
    expect(document.documentElement.getAttribute('data-theme')).toBe('schaefer');
    expect(localStorage.getItem(m.THEME_STORAGE_KEY)).not.toBe('warm');
    expect(localStorage.length).toBe(0);
  });

  it('импорт модуля не пишет в хранилище и не снимает data-theme="schaefer" от оболочки', async () => {
    document.documentElement.setAttribute('data-theme', 'schaefer');
    await import('./useTheme');
    expect(document.documentElement.getAttribute('data-theme')).toBe('schaefer');
    expect(localStorage.length).toBe(0);
  });

  it('оболочка поставила schaefer до импорта — последующий applyTheme тоже заперт', async () => {
    document.documentElement.setAttribute('data-theme', 'schaefer');
    const m = await import('./useTheme');
    m.applyTheme('warm');
    expect(document.documentElement.getAttribute('data-theme')).toBe('schaefer');
    expect(localStorage.length).toBe(0);
  });

  it('обычная сборка: импорт ставит атрибут по сохранённому выбору и ничего не пишет', async () => {
    localStorage.setItem('ladungsplaner.theme', 'warm');
    await import('./useTheme');
    expect(document.documentElement.getAttribute('data-theme')).toBe('warm');
    expect(localStorage.getItem('ladungsplaner.theme')).toBe('warm');
    expect(localStorage.length).toBe(1);
  });

  it('обычная сборка: пустое хранилище после импорта остаётся пустым', async () => {
    await import('./useTheme');
    expect(localStorage.length).toBe(0);
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('обычная сборка: явный applyTheme по-прежнему запоминает выбор', async () => {
    const m = await import('./useTheme');
    m.applyTheme('warm');
    expect(localStorage.getItem(m.THEME_STORAGE_KEY)).toBe('warm');
  });
});
